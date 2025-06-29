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
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the same directory as this script
dotenv.config({ path: path.join(__dirname, ".env") });

// ========================================
// TOOL CONFIGURATION - Enable/Disable Tools
// ========================================
const TOOL_CONFIG = {
  web_navigate: true, // Navigate to URLs and highlight elements
  web_click: true, // Click on elements
  web_type: true, // Type text into inputs
  web_scroll: true, // Scroll page up/down
  web_select: true, // Select dropdown options
  web_hover: false, // Hover over elements
  web_press_key: false, // Press keyboard keys
  web_wait: true, // Wait for specified time
  web_clear: false, // Clear input fields
  web_screenshot: true, // Take screenshots
  web_analyze: true, // AI vision analysis of page
};

// Helper function to get enabled tools
function getEnabledTools() {
  const allTools = [
    {
      name: "web_navigate",
      description:
        "Navigate to a URL and automatically highlight all interactive elements with numbered overlays. Returns detailed DOM hierarchy about each element with [ref=X] as element_id, including type, text content, placeholders, options, and more to help you understand what actions can be taken on the page.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to navigate to (e.g., 'https://example.com')",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "web_click",
      description:
        "Click on a web element using its reference number from the DOM hierarchy. The element must be referenced as [ref=X] in the DOM hierarchy. Use the reference number (e.g., '1', '5', '12') that corresponds to the interactive element you want to click.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '1', '5', '12') corresponding to the [ref=X] element you want to click",
          },
        },
        required: ["element_id"],
      },
    },
    {
      name: "web_type",
      description:
        "Type text into an input field, textarea, or other text-editable element using its reference number from the DOM hierarchy. The element must be referenced as [ref=X] in the DOM hierarchy output from the previous web_navigate step.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '3') corresponding to the [ref=X] input field you want to type into",
          },
          text: {
            type: "string",
            description: "The text to type into the field",
          },
        },
        required: ["element_id", "text"],
      },
    },
    {
      name: "web_scroll",
      description:
        "Scroll the page vertically to reveal more content. Useful for long pages, infinite scroll, or accessing elements outside the current viewport.",
      inputSchema: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down"],
            description: "The direction to scroll ('up' or 'down')",
          },
          amount: {
            type: "number",
            description:
              "Optional scroll distance in pixels (default: 500, range: 1-5000)",
          },
        },
        required: ["direction"],
      },
    },
    {
      name: "web_select",
      description:
        "Select an option from a dropdown menu or select element using its reference number from the DOM hierarchy. The element must be referenced as [ref=X] in the DOM hierarchy output from the previous web_navigate step. Works with both standard HTML select elements and custom dropdown implementations.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '4') corresponding to the [ref=X] dropdown element you want to select from",
          },
          option: {
            type: "string",
            description:
              "The option text or value to select (e.g., 'United States', 'option-value-123')",
          },
        },
        required: ["element_id", "option"],
      },
    },
    {
      name: "web_hover",
      description:
        "Hover the mouse over a web element using its reference number from the DOM hierarchy to trigger hover effects, reveal hidden menus, or show tooltips. The element must be referenced as [ref=X] in the DOM hierarchy output from the previous web_navigate step. Useful for dropdown menus and interactive elements.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '7') corresponding to the [ref=X] element you want to hover over",
          },
        },
        required: ["element_id"],
      },
    },
    {
      name: "web_press_key",
      description:
        "Press keyboard keys or key combinations to trigger shortcuts, submit forms, navigate, or perform other keyboard-based actions.",
      inputSchema: {
        type: "object",
        properties: {
          keys: {
            type: "string",
            description:
              "The key or key combination to press. Examples: 'Enter', 'Tab', 'Escape', 'Ctrl+A', 'Shift+Tab', 'Ctrl+C', 'Ctrl+V'",
          },
        },
        required: ["keys"],
      },
    },
    {
      name: "web_wait",
      description:
        "Pause execution for a specified time to wait for page loads, animations, or dynamic content to appear. Useful when pages need time to update after interactions.",
      inputSchema: {
        type: "object",
        properties: {
          seconds: {
            type: "number",
            description:
              "The number of seconds to wait. Supports decimals for precise timing (e.g., 1.5, 2.0, 0.5). Range: 0.1-60 seconds",
          },
        },
        required: ["seconds"],
      },
    },
    {
      name: "web_clear",
      description:
        "Clear all text content from an input field, textarea, or other editable element using its reference number from the DOM hierarchy. The element must be referenced as [ref=X] in the DOM hierarchy output from the previous web_navigate step. Equivalent to selecting all text and deleting it.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '2') corresponding to the [ref=X] input field you want to clear",
          },
        },
        required: ["element_id"],
      },
    },
    {
      name: "web_screenshot",
      description:
        "Capture a screenshot of the current page state for visual reference or debugging.",
      inputSchema: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description:
              "Optional custom filename for the screenshot (without extension). If not provided, a timestamp-based name will be used.",
          },
        },
      },
    },
    {
      name: "web_analyze",
      description:
        "Analyze the current page content using AI's capabilities of understanding screenshot. ONLY use this tool when the user explicitly mentions 'analyze page' or 'extract info from the page'.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "The analysis question or instruction (e.g., 'What products are shown on this page?', 'Is the login successful?', 'Extract all the prices displayed')",
          },
        },
        required: ["prompt"],
      },
    },
  ];

  // Filter tools based on configuration
  return allTools.filter((tool) => TOOL_CONFIG[tool.name] === true);
}

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

  async performAction(action) {
    try {
      await this.initialize();
    } catch (error) {
      throw new Error(`Failed to initialize browser: ${error.message}`);
    }

    this.logger.info(`Performing action: ${action}`);

    try {
      if (action.startsWith("CLICK:")) {
        const elementId = action.replace("CLICK:", "").trim();
        const selector = this.elementMap.get(elementId);

        if (!selector) {
          throw new Error(
            `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
          );
        }

        const element = await this.page.$(selector);

        if (element) {
          // Store current URL to detect navigation
          const currentUrl = this.page.url();

          await element.click();
          this.logger.success(
            `Clicked element ${elementId} using selector: ${selector}`
          );

          // Wait for potential navigation with timeout
          try {
            await Promise.race([
              this.page.waitForNavigation({ timeout: 3000 }),
              this.waitFor(3000),
            ]);
          } catch (navigationError) {
            // Navigation timeout is fine, just continue
            this.logger.debug(
              `No navigation detected after click: ${navigationError.message}`
            );
          }

          // Check if URL changed (indicating navigation)
          const newUrl = this.page.url();
          if (currentUrl !== newUrl) {
            this.logger.info(`Page navigated from ${currentUrl} to ${newUrl}`);
            // Clear element map since page changed
            this.elementMap.clear();
            // Clear window object data as well
            await this.pageHierarchy.clearWindowObjectData();
          }

          return { success: true, message: `Clicked element ${elementId}` };
        } else {
          throw new Error(
            `Element ${elementId} not found on page with selector: ${selector}. The element may have been removed or modified since the last page hierarchy generation.`
          );
        }
      } else if (action.startsWith("TYPE:")) {
        const parts = action.replace("TYPE:", "").split(":");
        const elementId = parts[0].trim();
        const text = parts.slice(1).join(":").trim();
        const selector = this.elementMap.get(elementId);

        if (!selector) {
          throw new Error(
            `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
          );
        }

        const element = await this.page.$(selector);

        if (element) {
          // Store current URL to detect navigation
          const currentUrl = this.page.url();

          await element.click();
          await element.evaluate((el) => (el.value = ""));
          await element.type(text);
          this.logger.success(
            `Typed "${text}" into element ${elementId} using selector: ${selector}`
          );

          // Check if URL changed (indicating navigation)
          const newUrl = this.page.url();
          if (currentUrl !== newUrl) {
            this.logger.info(`Page navigated from ${currentUrl} to ${newUrl}`);
            // Clear element map since page changed
            this.elementMap.clear();
            // Clear window object data as well
            await this.pageHierarchy.clearWindowObjectData();
          }

          return {
            success: true,
            message: `Typed "${text}" into element ${elementId}`,
          };
        } else {
          throw new Error(
            `Input element ${elementId} not found on page with selector: ${selector}. The element may have been removed or modified since the last page hierarchy generation.`
          );
        }
      } else if (action.startsWith("FETCH:")) {
        const url = action.replace("FETCH:", "").trim();
        await this.page.goto(url, { waitUntil: "networkidle2" });
        this.logger.success(`Navigated to: ${url}`);
        await this.waitFor(2000);

        // Get page title and URL for context
        const pageTitle = await this.page.title();
        const currentUrl = this.page.url();

        const result = {
          success: true,
          message: `Navigated to: ${url}`,
          pageInfo: {
            title: pageTitle,
            url: currentUrl,
          },
        };

        this.logger.success(`Successfully navigated to ${url}`);
        return result;
      } else if (action.startsWith("SCROLL:")) {
        const parts = action.replace("SCROLL:", "").split(":");
        const direction = parts[0].trim().toLowerCase();
        const customAmount = parts[1] ? parseInt(parts[1].trim()) : 500;
        const scrollAmount = direction === "up" ? -customAmount : customAmount;

        await this.page.evaluate((amount) => {
          window.scrollBy(0, amount);
        }, scrollAmount);

        this.logger.success(
          `Scrolled ${direction} by ${Math.abs(scrollAmount)} pixels`
        );
        await this.waitFor(1000);
        return {
          success: true,
          message: `Scrolled ${direction} by ${Math.abs(scrollAmount)} pixels`,
        };
      } else if (action.startsWith("SELECT:")) {
        const parts = action.replace("SELECT:", "").split(":");
        const elementId = parts[0].trim();
        const optionText = parts.slice(1).join(":").trim();
        const selector = this.elementMap.get(elementId);

        if (!selector) {
          throw new Error(
            `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
          );
        }

        const element = await this.page.$(selector);

        if (element) {
          // Store current URL to detect navigation
          const currentUrl = this.page.url();

          const tagName = await element.evaluate((el) =>
            el.tagName.toLowerCase()
          );

          if (tagName === "select") {
            const optionSelected = await element.evaluate((selectEl, text) => {
              const options = Array.from(selectEl.options);
              const targetOption = options.find(
                (option) =>
                  option.text
                    .trim()
                    .toLowerCase()
                    .includes(text.toLowerCase()) ||
                  option.value.toLowerCase().includes(text.toLowerCase())
              );

              if (targetOption) {
                selectEl.value = targetOption.value;
                selectEl.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
              }
              return false;
            }, optionText);

            if (optionSelected) {
              this.logger.success(
                `Selected "${optionText}" from dropdown ${elementId}`
              );
              await this.waitFor(1000);

              // Check if URL changed (indicating navigation)
              const newUrl = this.page.url();
              if (currentUrl !== newUrl) {
                this.logger.info(
                  `Page navigated from ${currentUrl} to ${newUrl}`
                );
                // Clear element map since page changed
                this.elementMap.clear();
                // Clear window object data as well
                await this.pageHierarchy.clearWindowObjectData();
              }

              return {
                success: true,
                message: `Selected "${optionText}" from dropdown ${elementId}`,
              };
            } else {
              throw new Error(
                `Option "${optionText}" not found in dropdown ${elementId}`
              );
            }
          } else {
            await element.click();
            await this.waitFor(500);

            const optionClicked = await this.page.evaluate((text) => {
              const elements = document.querySelectorAll("*");
              for (const el of elements) {
                if (
                  el.textContent &&
                  el.textContent
                    .trim()
                    .toLowerCase()
                    .includes(text.toLowerCase())
                ) {
                  el.click();
                  return true;
                }
              }
              return false;
            }, optionText);

            if (optionClicked) {
              this.logger.success(
                `Selected "${optionText}" from dropdown ${elementId}`
              );
              await this.waitFor(1000);

              // Check if URL changed (indicating navigation)
              const newUrl = this.page.url();
              if (currentUrl !== newUrl) {
                this.logger.info(
                  `Page navigated from ${currentUrl} to ${newUrl}`
                );
                // Clear element map since page changed
                this.elementMap.clear();
                // Clear window object data as well
                await this.pageHierarchy.clearWindowObjectData();
              }

              return {
                success: true,
                message: `Selected "${optionText}" from dropdown ${elementId}`,
              };
            } else {
              throw new Error(
                `Could not select "${optionText}" from dropdown ${elementId}`
              );
            }
          }
        } else {
          throw new Error(`Dropdown element ${elementId} not found on page`);
        }
      } else if (action.startsWith("HOVER:")) {
        const elementId = action.replace("HOVER:", "").trim();
        const selector = this.elementMap.get(elementId);

        if (!selector) {
          throw new Error(
            `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
          );
        }

        const element = await this.page.$(selector);

        if (element) {
          // Store current URL to detect navigation
          const currentUrl = this.page.url();

          await element.hover();
          this.logger.success(`Hovered over element ${elementId}`);
          await this.waitFor(1000);

          // Check if URL changed (indicating navigation)
          const newUrl = this.page.url();
          if (currentUrl !== newUrl) {
            this.logger.info(`Page navigated from ${currentUrl} to ${newUrl}`);
            // Clear element map since page changed
            this.elementMap.clear();
            // Clear window object data as well
            await this.pageHierarchy.clearWindowObjectData();
          }

          return {
            success: true,
            message: `Hovered over element ${elementId}`,
          };
        } else {
          throw new Error(`Element ${elementId} not found on page for hover`);
        }
      } else if (action.startsWith("PRESS:")) {
        const keySequence = action.replace("PRESS:", "").trim();

        if (keySequence.includes("+")) {
          const keys = keySequence.split("+");
          const modifiers = keys.slice(0, -1);
          const mainKey = keys[keys.length - 1];

          const options = {};
          if (modifiers.includes("Ctrl") || modifiers.includes("Control")) {
            options.ctrlKey = true;
          }
          if (modifiers.includes("Shift")) {
            options.shiftKey = true;
          }
          if (modifiers.includes("Alt")) {
            options.altKey = true;
          }
          if (modifiers.includes("Meta") || modifiers.includes("Cmd")) {
            options.metaKey = true;
          }

          await this.page.keyboard.press(mainKey, options);
          this.logger.success(`Pressed key combination: ${keySequence}`);
        } else {
          await this.page.keyboard.press(keySequence);
          this.logger.success(`Pressed key: ${keySequence}`);
        }

        await this.waitFor(500);
        return { success: true, message: `Pressed key: ${keySequence}` };
      } else if (action.startsWith("WAIT:")) {
        const seconds = parseFloat(action.replace("WAIT:", "").trim());

        if (isNaN(seconds) || seconds <= 0) {
          throw new Error(`Invalid wait time: ${seconds}`);
        }

        this.logger.info(`Waiting ${seconds} seconds...`);
        await this.waitFor(seconds * 1000);
        this.logger.success(`Waited ${seconds} seconds`);
        return { success: true, message: `Waited ${seconds} seconds` };
      } else if (action.startsWith("CLEAR:")) {
        const elementId = action.replace("CLEAR:", "").trim();
        const selector = this.elementMap.get(elementId);

        if (!selector) {
          throw new Error(
            `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
          );
        }

        const element = await this.page.$(selector);

        if (element) {
          // Store current URL to detect navigation
          const currentUrl = this.page.url();

          await element.click();
          await this.page.keyboard.down("Control");
          await this.page.keyboard.press("a");
          await this.page.keyboard.up("Control");
          await this.page.keyboard.press("Delete");
          this.logger.success(`Cleared content from element ${elementId}`);

          // Check if URL changed (indicating navigation)
          const newUrl = this.page.url();
          if (currentUrl !== newUrl) {
            this.logger.info(`Page navigated from ${currentUrl} to ${newUrl}`);
            // Clear element map since page changed
            this.elementMap.clear();
            // Clear window object data as well
            await this.pageHierarchy.clearWindowObjectData();
          }

          return {
            success: true,
            message: `Cleared content from element ${elementId}`,
          };
        } else {
          throw new Error(
            `Element ${elementId} not found on page for clearing`
          );
        }
      } else if (action.startsWith("ANALYZE")) {
        // Check if Anthropic API key is configured
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error(
            "Anthropic API key not found. Please set ANTHROPIC_API_KEY in your .env file. You can get an API key from https://console.anthropic.com/"
          );
        }

        const analysisPrompt = action.replace("ANALYZE:", "").trim();
        const screenshotPath = await this.takeScreenshot(
          `analyze-${Date.now()}.jpg`
        );

        try {
          const analysisResponse = await this.anthropicClient.analyzeWithClaude(
            screenshotPath,
            analysisPrompt,
            this.systemMessage
          );

          this.logger.success(`Analyzed with prompt: ${analysisPrompt}`);
          return {
            success: true,
            message: `Analysis completed`,
            analysis: analysisResponse,
            screenshot: screenshotPath,
          };
        } catch (error) {
          if (
            error.message.includes("apiKey") ||
            error.message.includes("authentication")
          ) {
            throw new Error(
              "Failed to authenticate with Claude. Please check your ANTHROPIC_API_KEY in .env file is correct and valid."
            );
          }
          throw error;
        }
      } else {
        throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      this.logger.error(`Action failed: ${error.message}`);
      throw error;
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

    switch (name) {
      case "web_navigate":
        const result = await automation.performAction(`FETCH:${args.url}`);

        // Get page hierarchy summary
        const navHierarchy =
          await automation.pageHierarchy.safelyGetPageHierarchy();

        return {
          content: [
            {
              type: "text",
              text: `${result.message}\n\n${navHierarchy}`,
            },
          ],
        };

      case "web_click":
        const clickResult = await automation.performAction(
          `CLICK:${args.element_id}`
        );
        const clickHierarchy =
          await automation.pageHierarchy.safelyGetPageHierarchy();
        return {
          content: [
            {
              type: "text",
              text: `${clickResult.message}\n\n${clickHierarchy}`,
            },
          ],
        };

      case "web_type":
        const typeResult = await automation.performAction(
          `TYPE:${args.element_id}:${args.text}`
        );
        const typeHierarchy =
          await automation.pageHierarchy.safelyGetPageHierarchy();
        return {
          content: [
            {
              type: "text",
              text: `${typeResult.message}\n\n${typeHierarchy}`,
            },
          ],
        };

      case "web_scroll":
        const scrollAction = args.amount
          ? `SCROLL:${args.direction}:${args.amount}`
          : `SCROLL:${args.direction}`;
        const scrollResult = await automation.performAction(scrollAction);
        const scrollHierarchy =
          await automation.pageHierarchy.safelyGetPageHierarchy();
        return {
          content: [
            {
              type: "text",
              text: `${scrollResult.message}\n\n${scrollHierarchy}`,
            },
          ],
        };

      case "web_select":
        const selectResult = await automation.performAction(
          `SELECT:${args.element_id}:${args.option}`
        );
        const selectHierarchy =
          await automation.pageHierarchy.safelyGetPageHierarchy();
        return {
          content: [
            {
              type: "text",
              text: `${selectResult.message}\n\n${selectHierarchy}`,
            },
          ],
        };

      case "web_hover":
        const hoverResult = await automation.performAction(
          `HOVER:${args.element_id}`
        );
        const hoverHierarchy =
          await automation.pageHierarchy.safelyGetPageHierarchy();
        return {
          content: [
            {
              type: "text",
              text: `${hoverResult.message}\n\n${hoverHierarchy}`,
            },
          ],
        };

      case "web_press_key":
        const pressResult = await automation.performAction(
          `PRESS:${args.keys}`
        );
        const pressHierarchy =
          await automation.pageHierarchy.safelyGetPageHierarchy();
        return {
          content: [
            {
              type: "text",
              text: `${pressResult.message}\n\n${pressHierarchy}`,
            },
          ],
        };

      case "web_wait":
        const waitResult = await automation.performAction(
          `WAIT:${args.seconds}`
        );
        return {
          content: [
            {
              type: "text",
              text: waitResult.message,
            },
          ],
        };

      case "web_clear":
        const clearResult = await automation.performAction(
          `CLEAR:${args.element_id}`
        );
        const clearHierarchy =
          await automation.pageHierarchy.safelyGetPageHierarchy();
        return {
          content: [
            {
              type: "text",
              text: `${clearResult.message}\n\n${clearHierarchy}`,
            },
          ],
        };

      case "web_screenshot":
        const filename = args.filename || "screenshot.jpg";
        const screenshotPath = await automation.takeScreenshot(filename);
        return {
          content: [
            {
              type: "text",
              text: `Screenshot saved to: ${screenshotPath}`,
            },
          ],
        };

      case "web_analyze":
        const analyzeResult = await automation.performAction(
          `ANALYZE:${args.prompt}`
        );
        return {
          content: [
            {
              type: "text",
              text: `Analysis: ${analyzeResult.analysis}`,
            },
          ],
        };

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
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
