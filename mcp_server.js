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
import Prompts from "./prompts.js";
import dotenv from "dotenv";

dotenv.config();

class WebAutomationMCPServer {
  constructor() {
    this.browser = null;
    this.page = null;

    // Ensure logs directory exists before creating logger
    this.ensureLogsDirectory();

    this.logger = new Logger({
      logFile: `logs/mcp-server-${new Date().toISOString()}.log`,
      showInTerminal: false, // Disable terminal output for MCP server to avoid interfering with stdio
    });
    this.anthropicClient = new AnthropicClient(this.logger);
    this.systemMessage = Prompts.getSystemMessage();
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
    const filePath = `logs/mcp-${timestamp}-${filename}`;

    // Ensure logs directory exists
    try {
      if (!fs.existsSync("logs")) {
        fs.mkdirSync("logs", { recursive: true });
      }
    } catch (error) {
      this.logger.error(`Could not create logs directory: ${error.message}`);
      // Fallback to current directory
      const fallbackPath = `mcp-${timestamp}-${filename}`;
      this.logger.info(`Using fallback path: ${fallbackPath}`);

      try {
        await this.page.screenshot({
          path: fallbackPath,
          fullPage: false,
          quality: 90,
        });
        this.logger.debug(`Screenshot saved as ${fallbackPath}`);
        return fallbackPath;
      } catch (screenshotError) {
        throw new Error(
          `Failed to take screenshot: ${screenshotError.message}`
        );
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

  async highlightLinks() {
    this.logger.debug("Highlighting interactive elements...");

    const elements = await this.page.evaluate(() => {
      // Remove previous highlights
      const existingHighlights = document.querySelectorAll(
        "[data-gbt-highlight]"
      );
      existingHighlights.forEach((el) => {
        el.style.border = "";
        el.style.position = "";
        el.removeAttribute("data-gbt-highlight");
        el.removeAttribute("gbt_link_text");
      });

      // Remove previous number overlays
      const existingNumbers = document.querySelectorAll(".gbt-element-number");
      existingNumbers.forEach((el) => el.remove());

      // Find all interactive elements
      const selectors = [
        "a[href]",
        "button",
        'input:not([type="hidden"])',
        "textarea",
        "select",
        "[onclick]",
        '[role="button"]',
        '[role="link"]',
        "[tabindex]",
      ];

      const interactiveElements = [];
      selectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          if (!interactiveElements.includes(el)) {
            interactiveElements.push(el);
          }
        });
      });

      // Filter visible and in-viewport elements
      const visibleElements = interactiveElements.filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0
        );
      });

      // Highlight elements and add numbers
      visibleElements.forEach((el, index) => {
        const elementNumber = index + 1;
        el.setAttribute("gbt_link_text", elementNumber);
        el.setAttribute("data-gbt-highlight", "true");
        el.style.border = "2px solid red";

        // Create number overlay
        const numberOverlay = document.createElement("div");
        numberOverlay.className = "gbt-element-number";
        numberOverlay.textContent = elementNumber;
        numberOverlay.style.cssText = `
          position: absolute;
          top: ${el.getBoundingClientRect().top + window.pageYOffset - 5}px;
          left: ${el.getBoundingClientRect().left + window.pageXOffset - 5}px;
          width: 20px;
          height: 20px;
          background-color: red;
          color: white;
          font-size: 12px;
          font-weight: bold;
          text-align: center;
          line-height: 20px;
          border-radius: 50%;
          z-index: 10000;
          pointer-events: none;
        `;
        document.body.appendChild(numberOverlay);
      });

      return visibleElements.length;
    });

    this.logger.success(`Highlighted ${elements} interactive elements`);
    return elements;
  }

  async collectElementsInfo() {
    // Collect detailed information about all interactive elements
    const elementsInfo = await this.page.evaluate(() => {
      const elements = document.querySelectorAll("[gbt_link_text]");
      return Array.from(elements).map((el, index) => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);

        // Get element text content (trimmed and limited)
        let textContent = el.textContent?.trim() || "";
        if (textContent.length > 100) {
          textContent = textContent.substring(0, 100) + "...";
        }

        // Get placeholder for inputs
        const placeholder = el.placeholder || "";

        // Get value for inputs
        const value = el.value || "";

        // Get href for links
        const href = el.href || "";

        // Get options for select elements
        let options = [];
        if (el.tagName.toLowerCase() === "select") {
          options = Array.from(el.options).map((opt) => ({
            text: opt.text.trim(),
            value: opt.value,
          }));
        }

        return {
          id: el.getAttribute("gbt_link_text"),
          tagName: el.tagName.toLowerCase(),
          type: el.type || "",
          textContent: textContent,
          placeholder: placeholder,
          value: value,
          href: href,
          className: el.className || "",
          id_attr: el.id || "",
          name: el.name || "",
          role: el.getAttribute("role") || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          title: el.title || "",
          disabled: el.disabled || false,
          required: el.required || false,
          options: options,
          position: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            styles.visibility !== "hidden" &&
            styles.display !== "none",
        };
      });
    });

    return elementsInfo;
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
        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.click();
          this.logger.success(`Clicked element ${elementId}`);
          await this.waitFor(2000);
          return { success: true, message: `Clicked element ${elementId}` };
        } else {
          throw new Error(`Element ${elementId} not found`);
        }
      } else if (action.startsWith("TYPE:")) {
        const parts = action.replace("TYPE:", "").split(":");
        const elementId = parts[0].trim();
        const text = parts.slice(1).join(":").trim();

        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.click();
          await element.evaluate((el) => (el.value = ""));
          await element.type(text);
          this.logger.success(`Typed "${text}" into element ${elementId}`);
          return {
            success: true,
            message: `Typed "${text}" into element ${elementId}`,
          };
        } else {
          throw new Error(`Input element ${elementId} not found`);
        }
      } else if (action.startsWith("FETCH:")) {
        const url = action.replace("FETCH:", "").trim();
        await this.page.goto(url, { waitUntil: "networkidle2" });
        this.logger.success(`Navigated to: ${url}`);
        await this.waitFor(2000);

        // Automatically highlight elements and collect their information
        const elementCount = await this.highlightLinks();

        // Collect detailed information about all interactive elements
        const elementsInfo = await this.collectElementsInfo();

        // Get page title and URL for context
        const pageTitle = await this.page.title();
        const currentUrl = this.page.url();

        const result = {
          success: true,
          message: `Navigated to: ${url}`,
          pageInfo: {
            title: pageTitle,
            url: currentUrl,
            elementCount: elementCount,
          },
          elements: elementsInfo,
        };

        this.logger.success(
          `Collected information for ${elementsInfo.length} interactive elements`
        );
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

        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
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
          throw new Error(`Dropdown element ${elementId} not found`);
        }
      } else if (action.startsWith("HOVER:")) {
        const elementId = action.replace("HOVER:", "").trim();
        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.hover();
          this.logger.success(`Hovered over element ${elementId}`);
          await this.waitFor(1000);
          return {
            success: true,
            message: `Hovered over element ${elementId}`,
          };
        } else {
          throw new Error(`Element ${elementId} not found for hover`);
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
        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.click();
          await this.page.keyboard.down("Control");
          await this.page.keyboard.press("a");
          await this.page.keyboard.up("Control");
          await this.page.keyboard.press("Delete");
          this.logger.success(`Cleared content from element ${elementId}`);
          return {
            success: true,
            message: `Cleared content from element ${elementId}`,
          };
        } else {
          throw new Error(`Element ${elementId} not found for clearing`);
        }
      } else if (action.startsWith("ANALYZE")) {
        const analysisPrompt = action.replace("ANALYZE:", "").trim();
        const screenshotPath = await this.takeScreenshot(
          `analyze-${Date.now()}.jpg`
        );

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
    tools: [
      {
        name: "web_navigate",
        description:
          "Navigate to a URL and automatically highlight all interactive elements with numbered overlays. Returns detailed information about each element including type, text content, placeholders, options, and more to help you understand what actions can be taken on the page.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "The URL to navigate to (e.g., 'https://example.com')",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "web_click",
        description:
          "Click on a web element using its highlighted number. Elements must be highlighted first using web_navigate or web_highlight_elements.",
        inputSchema: {
          type: "object",
          properties: {
            element_id: {
              type: "string",
              description:
                "The highlighted element number to click (e.g., '1', '5', '12')",
            },
          },
          required: ["element_id"],
        },
      },
      {
        name: "web_type",
        description:
          "Type text into an input field, textarea, or other text-editable element. The element will be focused and any existing content will be cleared before typing.",
        inputSchema: {
          type: "object",
          properties: {
            element_id: {
              type: "string",
              description:
                "The highlighted element number of the input field (e.g., '3')",
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
              minimum: 1,
              maximum: 5000,
            },
          },
          required: ["direction"],
        },
      },
      {
        name: "web_select",
        description:
          "Select an option from a dropdown menu or select element. Works with both standard HTML select elements and custom dropdown implementations.",
        inputSchema: {
          type: "object",
          properties: {
            element_id: {
              type: "string",
              description:
                "The highlighted element number of the dropdown (e.g., '4')",
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
          "Hover the mouse over a web element to trigger hover effects, reveal hidden menus, or show tooltips. Useful for dropdown menus and interactive elements.",
        inputSchema: {
          type: "object",
          properties: {
            element_id: {
              type: "string",
              description:
                "The highlighted element number to hover over (e.g., '7')",
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
              minimum: 0.1,
              maximum: 60,
            },
          },
          required: ["seconds"],
        },
      },
      {
        name: "web_clear",
        description:
          "Clear all text content from an input field, textarea, or other editable element. Equivalent to selecting all text and deleting it.",
        inputSchema: {
          type: "object",
          properties: {
            element_id: {
              type: "string",
              description:
                "The highlighted element number of the input field to clear (e.g., '2')",
            },
          },
          required: ["element_id"],
        },
      },
      {
        name: "web_screenshot",
        description:
          "Capture a screenshot of the current page state for visual reference or debugging. The image is saved to the logs directory with a timestamp.",
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
        name: "web_highlight_elements",
        description:
          "Highlight all interactive elements on the current page with numbered red overlays. Use this to refresh element highlighting after page changes or to see what elements are available for interaction.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "web_refresh_elements",
        description:
          "Get updated detailed information about all currently highlighted interactive elements without navigating. Useful after page changes, form submissions, or dynamic content updates to see the current state of elements.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "web_analyze",
        description:
          "Analyze the current page content using AI vision capabilities. Takes a screenshot and uses Claude to answer questions about what's visible on the page, extract information, or describe the page state.",
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
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const automation = await getWebAutomation();

    switch (name) {
      case "web_navigate":
        const result = await automation.performAction(`FETCH:${args.url}`);

        // Format the enhanced response with element information
        let navResponseText = `${result.message}\n\nPage Information:\n`;
        navResponseText += `- Title: ${result.pageInfo.title}\n`;
        navResponseText += `- URL: ${result.pageInfo.url}\n`;
        navResponseText += `- Interactive Elements Found: ${result.pageInfo.elementCount}\n\n`;

        if (result.elements && result.elements.length > 0) {
          navResponseText += `Available Interactive Elements:\n`;
          result.elements.forEach((el) => {
            navResponseText += `\n[${el.id}] ${el.tagName.toUpperCase()}`;
            if (el.type) navResponseText += ` (${el.type})`;
            if (el.textContent) navResponseText += ` - "${el.textContent}"`;
            if (el.placeholder)
              navResponseText += ` - Placeholder: "${el.placeholder}"`;
            if (el.href) navResponseText += ` - Link: ${el.href}`;
            if (el.value) navResponseText += ` - Value: "${el.value}"`;
            if (el.options && el.options.length > 0) {
              navResponseText += ` - Options: ${el.options
                .map((opt) => opt.text)
                .join(", ")}`;
            }
            if (el.disabled) navResponseText += ` - DISABLED`;
            if (el.required) navResponseText += ` - REQUIRED`;
          });
        }

        return {
          content: [
            {
              type: "text",
              text: navResponseText,
            },
          ],
        };

      case "web_click":
        const clickResult = await automation.performAction(
          `CLICK:${args.element_id}`
        );
        return {
          content: [
            {
              type: "text",
              text: clickResult.message,
            },
          ],
        };

      case "web_type":
        const typeResult = await automation.performAction(
          `TYPE:${args.element_id}:${args.text}`
        );
        return {
          content: [
            {
              type: "text",
              text: typeResult.message,
            },
          ],
        };

      case "web_scroll":
        const scrollAction = args.amount
          ? `SCROLL:${args.direction}:${args.amount}`
          : `SCROLL:${args.direction}`;
        const scrollResult = await automation.performAction(scrollAction);
        return {
          content: [
            {
              type: "text",
              text: scrollResult.message,
            },
          ],
        };

      case "web_select":
        const selectResult = await automation.performAction(
          `SELECT:${args.element_id}:${args.option}`
        );
        return {
          content: [
            {
              type: "text",
              text: selectResult.message,
            },
          ],
        };

      case "web_hover":
        const hoverResult = await automation.performAction(
          `HOVER:${args.element_id}`
        );
        return {
          content: [
            {
              type: "text",
              text: hoverResult.message,
            },
          ],
        };

      case "web_press_key":
        const pressResult = await automation.performAction(
          `PRESS:${args.keys}`
        );
        return {
          content: [
            {
              type: "text",
              text: pressResult.message,
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
        return {
          content: [
            {
              type: "text",
              text: clearResult.message,
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

      case "web_highlight_elements":
        const elementCount = await automation.highlightLinks();
        return {
          content: [
            {
              type: "text",
              text: `Highlighted ${elementCount} interactive elements`,
            },
          ],
        };

      case "web_refresh_elements":
        const elementsInfo = await automation.collectElementsInfo();

        // Get page title and URL for context
        const pageTitle = await automation.page.title();
        const currentUrl = automation.page.url();

        let refreshResponseText = `Page Information:\n`;
        refreshResponseText += `- Title: ${pageTitle}\n`;
        refreshResponseText += `- URL: ${currentUrl}\n`;
        refreshResponseText += `- Interactive Elements Found: ${elementsInfo.length}\n\n`;

        if (elementsInfo && elementsInfo.length > 0) {
          refreshResponseText += `Available Interactive Elements:\n`;
          elementsInfo.forEach((el) => {
            refreshResponseText += `\n[${el.id}] ${el.tagName.toUpperCase()}`;
            if (el.type) refreshResponseText += ` (${el.type})`;
            if (el.textContent) refreshResponseText += ` - "${el.textContent}"`;
            if (el.placeholder)
              refreshResponseText += ` - Placeholder: "${el.placeholder}"`;
            if (el.href) refreshResponseText += ` - Link: ${el.href}`;
            if (el.value) refreshResponseText += ` - Value: "${el.value}"`;
            if (el.options && el.options.length > 0) {
              refreshResponseText += ` - Options: ${el.options
                .map((opt) => opt.text)
                .join(", ")}`;
            }
            if (el.disabled) refreshResponseText += ` - DISABLED`;
            if (el.required) refreshResponseText += ` - REQUIRED`;
          });
        } else {
          refreshResponseText += `No interactive elements found. You may need to run web_highlight_elements first.`;
        }

        return {
          content: [
            {
              type: "text",
              text: refreshResponseText,
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
