import fs from "fs";
import AnthropicClient from "./anthropic_client.js";
import Logger from "./logger.js";
import PageHierarchy from "./page_hierarchy.js";
import PuppeteerManager from "./puppeteer_manager.js";

class WebAutomationMCPServer {
  constructor(options = {}) {
    this.logger = new Logger({ logFile: null, showInTerminal: false }); // Console-only logging for MCP
    this.anthropicClient = new AnthropicClient(this.logger);
    this.pageHierarchy = null; // Will be initialized after page is ready

    // Initialize PuppeteerManager with Chrome profile options
    this.puppeteerManager = new PuppeteerManager({
      headless: options.headless || false,
      timeout: options.timeout || 30000,
      viewport: options.viewport || {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
      },

      // Chrome profile and connection options
      connectToExisting: options.connectToExisting !== false, // Default: try to connect
      userDataDir: options.userDataDir || null, // Use specific Chrome profile
      remoteDebuggingPort: options.remoteDebuggingPort || 9222,
      autoDetectChrome: options.autoDetectChrome !== false,
      executablePath: options.executablePath || null,

      ...options,
    });

    // Expose properties for backward compatibility with tool_handlers.js
    this.elementMap = this.puppeteerManager.elementMap;
  }

  // Expose browser and page properties for backward compatibility
  get browser() {
    return this.puppeteerManager.browser;
  }

  get page() {
    return this.puppeteerManager.page;
  }

  get isInitialized() {
    return this.puppeteerManager.isInitialized;
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
    this.logger.info("Initializing MCP web automation server...");

    try {
      // Use PuppeteerManager to initialize browser
      await this.puppeteerManager.initialize();

      // Initialize PageHierarchy after page is ready
      this.pageHierarchy = new PageHierarchy(
        this.puppeteerManager.page,
        this.puppeteerManager.elementMap,
        this.logger
      );

      this.logger.success("MCP web automation server initialized successfully");
    } catch (error) {
      this.logger.error(`Failed to initialize MCP server: ${error.message}`);
      throw new Error(`MCP Server initialization failed: ${error.message}`);
    }
  }

  async takeScreenshot(filename) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    let customFilename = `mcp-${timestamp}-${filename}`;

    // Try to ensure logs directory exists, but fallback if file system is read-only
    try {
      if (!fs.existsSync("logs")) {
        fs.mkdirSync("logs", { recursive: true });
      }
      customFilename = `logs/${customFilename}`;
    } catch (error) {
      this.logger.error(`Could not create logs directory: ${error.message}`);
      // Fallback to temp directory or current directory
      const os = await import("os");
      try {
        const tempDir = os.tmpdir();
        customFilename = `${tempDir}/${customFilename}`;
        this.logger.info(`Using temp directory path: ${customFilename}`);
      } catch (tempError) {
        // Final fallback to current directory
        this.logger.info(
          `Using current directory fallback path: ${customFilename}`
        );
      }
    }

    try {
      // Use PuppeteerManager's screenshot method
      const filePath = await this.puppeteerManager.takeScreenshot(
        customFilename,
        {
          fullPage: false,
          quality: 90,
        }
      );
      this.logger.debug(`Screenshot saved as ${filePath}`);
      return filePath;
    } catch (error) {
      throw new Error(`Failed to take screenshot: ${error.message}`);
    }
  }

  async waitFor(ms) {
    return this.puppeteerManager.wait(ms);
  }

  async cleanup() {
    try {
      await this.puppeteerManager.cleanup();
      this.logger.info("MCP server cleanup completed");
    } catch (error) {
      this.logger.error(`Error during cleanup: ${error.message}`);
    }
  }
}

export default WebAutomationMCPServer;
