#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer from "puppeteer";
import fs from "fs";
import AnthropicClient from "./anthropic_client.js";
import Logger from "./logger.js";
import PageHierarchy from "./page_hierarchy.js";
import { getEnabledTools, TOOL_CONFIG } from "./tools.js";
import { handleToolExecution } from "./tool_handlers.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the same directory as this script
dotenv.config({ path: path.join(__dirname, ".env") });

class WebAutomationMCPServer {
  constructor() {
    this.browser = null;
    this.page = null;
    this.logger = new Logger({ logFile: null, showInTerminal: false }); // Console-only logging for MCP
    this.elementMap = new Map(); // Store element references
    this.anthropicClient = new AnthropicClient(this.logger);
    this.pageHierarchy = null; // Will be initialized after page is ready
    this.isInitialized = false;
    this.initializationError = null;
    this.initializationPromise = null;
  }

  ensureLogsDirectory() {
    try {
      if (!fs.existsSync("logs")) {
        fs.mkdirSync("logs", { recursive: true });
      }
    } catch (error) {
      // If we can't create logs directory, we'll handle this gracefully
      console.error("Warning: Could not create logs directory:", error.message);
    }
  }

  async initialize() {
    // Return existing promise if initialization is already in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.isInitialized) {
      return;
    }

    if (this.initializationError) {
      throw this.initializationError;
    }

    // Create initialization promise
    this.initializationPromise = this._doInitialize();

    try {
      await this.initializationPromise;
    } catch (error) {
      this.initializationError = error;
      this.initializationPromise = null;
      throw error;
    }
  }

  async _doInitialize() {
    this.logger.info("Initializing MCP web automation server...");

    try {
      // Set a timeout for browser launch to prevent hanging
      const browserPromise = puppeteer.launch({
        headless: false,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
          "--disable-site-isolation-trials",
          "--disable-features=BlockInsecurePrivateNetworkRequests",
          "--allow-running-insecure-content",
          "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure",
          "--disable-features=IsolateOrigins",
          "--disable-features=OutOfBlinkCors",
          "--disable-features=CrossOriginOpenerPolicy",
          "--disable-features=CrossOriginEmbedderPolicy",
          "--disable-features=CrossOriginResourcePolicy",
          "--start-maximized",
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null,
        timeout: 30000, // 30 second timeout
      });

      // Add timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Browser launch timeout after 30 seconds")),
          30000
        );
      });

      this.browser = await Promise.race([browserPromise, timeoutPromise]);

      const pages = await this.browser.pages();
      this.page = pages[0] || (await this.browser.newPage());

      this.page.setDefaultNavigationTimeout(60000);
      this.page.setDefaultTimeout(60000);

      await this.page.setRequestInterception(true);
      this.page.on("request", (request) => {
        try {
          request.continue();
        } catch (error) {
          this.logger.debug(`Request interception error: ${error.message}`);
        }
      });

      this.page.on("response", (response) => {
        if (response.status() >= 400) {
          this.logger.warning(
            `Response error: ${response.status()} ${response.url()}`
          );
        }
      });

      this.page.on("console", (msg) => {
        if (msg.type() === "error") {
          this.logger.error(`Page error: ${msg.text()}`);
        }
      });

      await this.page.setViewport({
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
      });

      // Initialize PageHierarchy after page is ready
      this.pageHierarchy = new PageHierarchy(
        this.page,
        this.elementMap,
        this.logger
      );

      this.isInitialized = true;
      this.logger.success("MCP web automation server initialized successfully");
    } catch (error) {
      this.logger.error(`Failed to initialize MCP server: ${error.message}`);

      // Clean up on error
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (closeError) {
          this.logger.error(`Error closing browser: ${closeError.message}`);
        }
        this.browser = null;
        this.page = null;
      }

      throw new Error(`MCP Server initialization failed: ${error.message}`);
    }
  }

  async takeScreenshot(filename) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    let filePath = `logs/mcp-${timestamp}-${filename}`;

    // Try to ensure logs directory exists, but fallback if file system is read-only
    try {
      if (!fs.existsSync("logs")) {
        fs.mkdirSync("logs", { recursive: true });
      }
    } catch (error) {
      this.logger.error(`Could not create logs directory: ${error.message}`);
      // Fallback to temp directory or current directory
      const os = await import("os");
      try {
        const tempDir = os.tmpdir();
        filePath = `${tempDir}/mcp-${timestamp}-${filename}`;
        this.logger.info(`Using temp directory path: ${filePath}`);
      } catch (tempError) {
        // Final fallback to current directory
        filePath = `mcp-${timestamp}-${filename}`;
        this.logger.info(`Using current directory fallback path: ${filePath}`);
      }
    }

    try {
      await this.page.screenshot({
        path: filePath,
        fullPage: false,
        quality: 90,
      });
      this.logger.debug(`Screenshot saved as ${filePath}`);
      return filePath;
    } catch (error) {
      throw new Error(`Failed to take screenshot: ${error.message}`);
    }
  }

  async waitFor(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        this.logger.error(`Error during cleanup: ${error.message}`);
      }
      this.browser = null;
      this.page = null;
      this.isInitialized = false;
      this.initializationError = null;
      this.initializationPromise = null;
    }
  }
}

// Create MCP Server instance
const server = new Server(
  {
    name: "web-automation-server",
    version: "1.0.0",
    description:
      "AI-powered web automation server with Puppeteer. Provides comprehensive tools for web navigation, element interaction, form filling, and content analysis using Claude AI vision capabilities.",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

let webAutomation = null;

// Initialize web automation with error handling
async function getWebAutomation() {
  if (!webAutomation) {
    webAutomation = new WebAutomationMCPServer();
  }
  return webAutomation;
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: getEnabledTools(),
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Check if the tool is enabled
  if (TOOL_CONFIG[name] !== true) {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Tool '${name}' is disabled or not found`
    );
  }

  try {
    const automation = await getWebAutomation();
    return await handleToolExecution(name, args, automation);
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error.message}`
    );
  }
});

// Cleanup on exit
process.on("SIGINT", async () => {
  if (webAutomation) {
    await webAutomation.cleanup();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (webAutomation) {
    await webAutomation.cleanup();
  }
  process.exit(0);
});

// Handle uncaught exceptions to prevent server crashes
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Web Automation MCP Server running on stdio");
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Server startup error:", error);
  process.exit(1);
});
