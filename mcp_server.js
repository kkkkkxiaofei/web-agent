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

    // Try to setup logging, but fall back gracefully if file system is read-only
    let logFile = null;
    try {
      this.ensureLogsDirectory();
      logFile = `logs/mcp-server-${new Date().toISOString()}.log`;
    } catch (error) {
      // If we can't create logs directory, disable file logging
      console.error(
        "Warning: Could not setup file logging, continuing without log files:",
        error.message
      );
    }

    this.logger = new Logger({
      logFile: logFile, // Will be null if file logging failed to setup
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
        '[role="textbox"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="switch"]',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="menuitem"]',
        '[role="menuitemcheckbox"]',
        '[role="menuitemradio"]',
        '[role="option"]',
        '[role="searchbox"]',
        '[role="spinbutton"]',
        '[role="slider"]',
        '[role="tab"]',
        '[contenteditable="true"]',
        "[tabindex]",
      ];

      // First pass: collect all directly interactive elements
      const interactiveElements = new Set();
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
          interactiveElements.add(el);
        });
      });

      // Second pass: collect parent containers of interactive elements
      const containers = new Set();
      interactiveElements.forEach((el) => {
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
          if (
            parent.tagName.toLowerCase() === "form" ||
            parent.tagName.toLowerCase() === "fieldset" ||
            parent.getAttribute("role") === "group" ||
            parent.getAttribute("role") === "form" ||
            parent.getAttribute("role") === "toolbar" ||
            parent.getAttribute("role") === "menu" ||
            parent.getAttribute("role") === "menubar" ||
            parent.getAttribute("role") === "tablist" ||
            parent.getAttribute("role") === "listbox" ||
            parent.getAttribute("role") === "radiogroup"
          ) {
            containers.add(parent);
          }
          parent = parent.parentElement;
        }
      });

      // Combine both sets and convert to array
      const allElements = [...interactiveElements, ...containers];

      // Helper function to check if an element is visible
      const isVisible = (el) => {
        if (!el) return false;

        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        // Basic visibility checks
        if (
          style.visibility === "hidden" ||
          style.display === "none" ||
          style.opacity === "0" ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          return false;
        }

        // Check if element is in viewport
        if (
          rect.top >= window.innerHeight ||
          rect.bottom <= 0 ||
          rect.left >= window.innerWidth ||
          rect.right <= 0
        ) {
          return false;
        }

        // Check if element is covered by other elements
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        const elementAtPoint = document.elementFromPoint(center.x, center.y);
        return el === elementAtPoint || el.contains(elementAtPoint);
      };

      // Filter visible elements and their containers
      const visibleElements = allElements.filter((el) => {
        // Always include form containers even if not directly visible
        if (
          el.tagName.toLowerCase() === "form" ||
          el.getAttribute("role") === "form" ||
          el.getAttribute("role") === "group"
        ) {
          return true;
        }
        return isVisible(el);
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

  async summarizePageHierarchy() {
    try {
      // Always highlight links first to ensure gbt_link_text attributes are set
      await this.highlightLinks();

      const pageTitle = await this.page.title();
      const currentUrl = this.page.url();

      // Get the page hierarchy structure with optimized nesting
      const hierarchyData = await this.page.evaluate(() => {
        const getDirectTextContent = (el) => {
          // Get only direct text nodes, not from children
          const textNodes = [];
          for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent.trim();
              if (text) textNodes.push(text);
            }
          }
          return textNodes.join(" ").trim();
        };

        const getElementRole = (el) => {
          const tagName = el.tagName.toLowerCase();
          const type = el.type?.toLowerCase();
          const role = el.getAttribute("role");

          // Map form elements to semantic roles
          if (tagName === "input") {
            if (type === "checkbox") return "checkbox";
            if (type === "radio") return "radio";
            if (type === "submit") return "button";
            return "textbox";
          }

          if (tagName === "select") return "listbox";
          if (tagName === "textarea") return "textbox";
          if (tagName === "button") return "button";
          if (tagName === "a") return "link";
          if (tagName === "img") return "img";
          if (tagName === "ul" || tagName === "ol") return "list";
          if (tagName === "li") return "listitem";
          if (tagName === "p") return "paragraph";
          if (tagName.match(/^h[1-6]$/)) return "heading";
          if (tagName === "form") return "form";

          // Use explicit role if provided
          if (role) return role;

          // Default to semantic tag name or generic container
          return isSemanticElement(tagName) ? tagName : "div";
        };

        const isSemanticElement = (tagName) => {
          const semanticTags = [
            "header",
            "nav",
            "main",
            "article",
            "section",
            "aside",
            "footer",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "p",
            "ul",
            "ol",
            "li",
            "form",
            "table",
            "thead",
            "tbody",
            "tr",
            "td",
            "th",
            "img",
            "video",
            "audio",
            "canvas",
            "svg",
            "input",
            "button",
            "select",
            "textarea",
            "label",
            "fieldset",
            "blockquote",
            "pre",
            "code",
            "time",
            "address",
            "details",
            "summary",
            "dialog",
          ];
          return semanticTags.includes(tagName);
        };

        const hasInteractiveElement = (el) => {
          return el.getAttribute("gbt_link_text") !== null;
        };

        const getElementInfo = (el, depth = 0) => {
          const tagName = el.tagName.toLowerCase();
          const elementId = el.getAttribute("gbt_link_text");
          const type = el.type?.toLowerCase();
          const role = el.getAttribute("role");
          const ariaLabel = el.getAttribute("aria-label");
          const title = el.title;
          const placeholder = el.placeholder;
          const value = el.value;
          const href = el.href;
          const alt = el.alt;
          const required = el.required;
          const selected = el.selected;
          const checked = el.checked;
          const name = el.name;
          const label = el.labels?.[0]?.textContent?.trim();

          // Get semantic role for the element
          let semanticRole = getElementRole(el);

          // Special handling for form elements
          if (tagName === "input" || tagName === "textarea") {
            semanticRole = "textbox";
            if (type === "checkbox") semanticRole = "checkbox";
            if (type === "radio") semanticRole = "radio";
            if (type === "submit") semanticRole = "button";
          } else if (tagName === "select") {
            semanticRole = "listbox";
          } else if (tagName === "option") {
            semanticRole = "option";
          }

          // Get element description from various sources
          const getElementDescription = (el) => {
            // For form controls, use label or aria-label
            if (el.tagName.match(/^(input|button|select|textarea)$/i)) {
              return (
                el.labels?.[0]?.textContent?.trim() ||
                el.getAttribute("aria-label") ||
                el.getAttribute("placeholder") ||
                el.getAttribute("title") ||
                el.value ||
                ""
              );
            }

            // For links and buttons, combine text content with title/aria-label
            if (el.tagName === "A" || el.tagName === "BUTTON") {
              const text = el.textContent?.trim() || "";
              const title = el.getAttribute("title")?.trim() || "";
              const ariaLabel = el.getAttribute("aria-label")?.trim() || "";
              return [text, title, ariaLabel].filter(Boolean).join(" - ");
            }

            // For images, use alt text or title
            if (el.tagName === "IMG") {
              return el.getAttribute("alt") || el.getAttribute("title") || "";
            }

            // For headings and other text elements, use direct text content
            return getDirectTextContent(el);
          };

          const description = getElementDescription(el);

          // Check if this element or any of its children has an interactive element
          const hasInteractive =
            hasInteractiveElement(el) ||
            Array.from(el.querySelectorAll("*")).some((child) =>
              hasInteractiveElement(child)
            );

          // Build element info
          let elementInfo = {
            tagName: semanticRole,
            ref:
              elementId ||
              (hasInteractive
                ? `s${Date.now()}e${Math.floor(Math.random() * 1000)}`
                : null),
            text: description,
            attributes: {},
            children: [],
            url: null,
          };

          // Handle headings
          if (tagName.match(/^h[1-6]$/)) {
            elementInfo.attributes.level = parseInt(tagName.charAt(1));
            if (required) {
              elementInfo.text =
                (elementInfo.text || "") + " Required question";
            }
          }

          // Handle form elements
          if (semanticRole === "textbox") {
            if (label) elementInfo.text = label;
            if (required)
              elementInfo.text =
                (elementInfo.text || "") + " Required question";
          }

          // Handle links
          if (semanticRole === "link" && href) {
            elementInfo.url = href;
          }

          // Handle options
          if (semanticRole === "option") {
            if (selected) elementInfo.attributes.selected = true;
          }

          // Handle checkboxes and radios
          if (semanticRole === "checkbox" || semanticRole === "radio") {
            if (checked) elementInfo.attributes.checked = true;
          }

          // Add other relevant attributes
          if (ariaLabel) elementInfo.attributes.ariaLabel = ariaLabel;
          if (title) elementInfo.attributes.title = title;
          if (placeholder) elementInfo.attributes.placeholder = placeholder;
          if (
            value &&
            (semanticRole === "textbox" || semanticRole === "option")
          ) {
            elementInfo.attributes.value = value;
          }
          if (alt) elementInfo.attributes.alt = alt;
          if (required) elementInfo.attributes.required = true;

          // Process children only if depth is reasonable
          if (depth < 8) {
            for (const child of el.children) {
              const styles = window.getComputedStyle(child);
              if (styles.display !== "none" && styles.visibility !== "hidden") {
                const childInfo = getElementInfo(child, depth + 1);
                // Only add child if it has meaningful content or is semantic
                if (
                  childInfo.ref ||
                  childInfo.text ||
                  childInfo.children.length > 0 ||
                  childInfo.tagName !== "div" ||
                  childInfo.url
                ) {
                  elementInfo.children.push(childInfo);
                }
              }
            }
          }

          // Special handling for form containers
          if (
            semanticRole === "form" ||
            semanticRole === "list" ||
            semanticRole === "listitem"
          ) {
            // Collapse single-child containers that don't add semantic value
            if (
              elementInfo.children.length === 1 &&
              !elementInfo.text &&
              !elementInfo.ref
            ) {
              const child = elementInfo.children[0];
              if (child.tagName !== "div") {
                return child;
              }
            }
          }

          return elementInfo;
        };

        // Start from body or document element
        const rootElement = document.body || document.documentElement;
        return getElementInfo(rootElement);
      });

      // Format the hierarchy as YAML-like structure
      const formatHierarchy = (element, indent = 0) => {
        const spaces = "  ".repeat(indent);
        let output = "";

        // Skip pure container elements with no meaningful content
        if (
          element.tagName === "div" &&
          !element.text &&
          !element.ref &&
          !element.url &&
          element.children.length === 0
        ) {
          return "";
        }

        // Build the element line
        let elementLine = `${spaces}- ${element.tagName}`;

        // Format description text
        const formatDescription = (text) => {
          if (!text) return "";
          let formatted = text.replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
          if (formatted.length > 100) {
            formatted = formatted.substring(0, 100) + "...";
          }
          return formatted;
        };

        // Add text content and description
        const description = formatDescription(element.text);
        if (description) {
          elementLine += `: "${description}"`;
        }

        // Add attributes in a specific order
        if (element.attributes.level) {
          elementLine += ` [level=${element.attributes.level}]`;
        }
        // Always include ref if available, even for non-interactive elements
        if (element.ref) {
          elementLine += ` [ref=${element.ref}]`;
        }
        if (element.attributes.selected) {
          elementLine += ` [selected]`;
        }
        if (element.attributes.checked) {
          elementLine += ` [checked]`;
        }
        if (element.attributes.required) {
          elementLine += ` [required]`;
        }

        // Add value or placeholder
        if (element.attributes.placeholder) {
          elementLine += `: "${element.attributes.placeholder}"`;
        } else if (element.attributes.value) {
          elementLine += `: "${element.attributes.value}"`;
        }

        output += elementLine + "\n";

        // Add URL as a child element if present
        if (element.url) {
          output += `${spaces}  - /url: ${element.url}\n`;
        }

        // Process children
        for (const child of element.children) {
          const childOutput = formatHierarchy(child, indent + 1);
          if (childOutput) {
            output += childOutput;
          }
        }

        return output;
      };

      const hierarchyYaml = formatHierarchy(hierarchyData);

      return `- Page URL: ${currentUrl}
- Page Title: ${pageTitle}
- Page Snapshot
\`\`\`yaml
${hierarchyYaml}\`\`\``;
    } catch (error) {
      this.logger.error(`Failed to summarize page hierarchy: ${error.message}`);
      return "- Page hierarchy summary unavailable due to error";
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
        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.click();
          this.logger.success(`Clicked element ${elementId}`);
          await this.waitFor(2000);

          // Re-highlight elements after click to ensure proper element tracking
          await this.highlightLinks();

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

          // Re-highlight elements after typing
          await this.highlightLinks();

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

        // Get page hierarchy summary
        const navHierarchy = await automation.summarizePageHierarchy();

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
        const clickHierarchy = await automation.summarizePageHierarchy();
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
        const typeHierarchy = await automation.summarizePageHierarchy();
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
        const scrollHierarchy = await automation.summarizePageHierarchy();
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
        const selectHierarchy = await automation.summarizePageHierarchy();
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
        const hoverHierarchy = await automation.summarizePageHierarchy();
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
        const pressHierarchy = await automation.summarizePageHierarchy();
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
        const clearHierarchy = await automation.summarizePageHierarchy();
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
