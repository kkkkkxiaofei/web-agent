#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { getEnabledTools, TOOL_CONFIG } from "./tools.js";
import { handleToolExecution } from "./tool_handlers.js";
import WebAutomationMCPServer from "./automation_server.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the same directory as this script
dotenv.config({ path: path.join(__dirname, ".env") });

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
