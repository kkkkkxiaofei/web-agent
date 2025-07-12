import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * PuppeteerManager - Encapsulates all Puppeteer-related functionality
 * Handles browser lifecycle, page operations, element interactions, and navigation
 */
class PuppeteerManager {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.elementMap = new Map(); // Store element references
    this.isInitialized = false;
    this.initializationError = null;
    this.initializationPromise = null;
    this.connectedToExisting = false; // Track if we connected to existing browser

    // Configuration options
    this.options = {
      headless: options.headless || false,
      timeout: options.timeout || 30000,
      viewport: options.viewport || {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
      },

      // New options for existing Chrome connection
      connectToExisting: options.connectToExisting !== false, // Default: try to connect
      remoteDebuggingPort: options.remoteDebuggingPort || 9222,
      userDataDir: options.userDataDir || null, // Path to Chrome profile
      autoDetectChrome: options.autoDetectChrome !== false, // Auto-detect running Chrome
      executablePath: options.executablePath || null, // Custom Chrome path

      ...options,
    };
  }

  /**
   * Get default Chrome user data directory for the current OS
   */
  getDefaultChromeUserDataDir() {
    const platform = os.platform();
    const homeDir = os.homedir();

    switch (platform) {
      case "darwin": // macOS
        return path.join(homeDir, "Library/Application Support/Google/Chrome");
      case "win32": // Windows
        return path.join(homeDir, "AppData/Local/Google/Chrome/User Data");
      case "linux": // Linux
        return path.join(homeDir, ".config/google-chrome");
      default:
        return null;
    }
  }

  /**
   * Find Chrome executable path
   */
  findChromeExecutable() {
    const platform = os.platform();
    const possiblePaths = [];

    switch (platform) {
      case "darwin": // macOS
        possiblePaths.push(
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium"
        );
        break;
      case "win32": // Windows
        possiblePaths.push(
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          path.join(
            os.homedir(),
            "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"
          )
        );
        break;
      case "linux": // Linux
        possiblePaths.push(
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser"
        );
        break;
    }

    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    }
    return null;
  }

  /**
   * Check if Chrome is running with remote debugging
   */
  async checkExistingChrome() {
    try {
      const response = await fetch(
        `http://localhost:${this.options.remoteDebuggingPort}/json/version`
      );
      if (response.ok) {
        const data = await response.json();
        console.log(`Found existing Chrome: ${data.Browser}`);
        return true;
      }
    } catch (error) {
      // Chrome not running with remote debugging
    }
    return false;
  }

  /**
   * Try to connect to existing Chrome instance
   */
  async connectToExistingChrome() {
    try {
      // Method 1: Try connecting with browserURL (simpler)
      const browserURL = `http://localhost:${this.options.remoteDebuggingPort}`;

      this.browser = await puppeteer.connect({
        browserURL,
        defaultViewport: null,
      });

      console.log(
        `Connected to existing Chrome on port ${this.options.remoteDebuggingPort}`
      );
      this.connectedToExisting = true;
      return true;
    } catch (error) {
      // Method 2: Try getting WebSocket endpoint manually
      try {
        const response = await fetch(
          `http://localhost:${this.options.remoteDebuggingPort}/json`
        );
        const targets = await response.json();

        // Find a browser target
        const browserTarget = targets.find(
          (target) => target.type === "browser"
        );
        if (browserTarget && browserTarget.webSocketDebuggerUrl) {
          this.browser = await puppeteer.connect({
            browserWSEndpoint: browserTarget.webSocketDebuggerUrl,
            defaultViewport: null,
          });

          console.log(`Connected to existing Chrome via WebSocket`);
          this.connectedToExisting = true;
          return true;
        }
      } catch (wsError) {
        // WebSocket connection failed
      }

      return false;
    }
  }

  /**
   * Launch Chrome with user profile
   */
  async launchWithProfile() {
    const userDataDir =
      this.options.userDataDir || this.getDefaultChromeUserDataDir();

    if (!userDataDir || !fs.existsSync(userDataDir)) {
      throw new Error(`Chrome user data directory not found: ${userDataDir}`);
    }

    const browserOptions = {
      headless: this.options.headless,
      userDataDir: userDataDir,
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
        `--remote-debugging-port=${this.options.remoteDebuggingPort}`,
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: null,
      timeout: this.options.timeout,
    };

    // Add executable path if specified
    if (this.options.executablePath) {
      browserOptions.executablePath = this.options.executablePath;
    } else {
      const chromePath = this.findChromeExecutable();
      if (chromePath) {
        browserOptions.executablePath = chromePath;
      }
    }

    console.log(`Launching Chrome with profile: ${userDataDir}`);
    this.browser = await puppeteer.launch(browserOptions);
    return true;
  }

  /**
   * Launch new Chrome instance (fallback)
   */
  async launchNewChrome() {
    const browserOptions = {
      headless: this.options.headless,
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
        `--remote-debugging-port=${this.options.remoteDebuggingPort}`,
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: null,
      timeout: this.options.timeout,
    };

    // Add executable path if specified
    if (this.options.executablePath) {
      browserOptions.executablePath = this.options.executablePath;
    }

    console.log("Launching new Chrome instance");
    this.browser = await puppeteer.launch(browserOptions);
    return true;
  }

  /**
   * Initialize the browser and page
   */
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

  /**
   * Internal initialization method
   */
  async _doInitialize() {
    try {
      let connected = false;

      // Strategy 1: Try to connect to existing Chrome with remote debugging
      if (this.options.connectToExisting && this.options.autoDetectChrome) {
        const hasExistingChrome = await this.checkExistingChrome();
        if (hasExistingChrome) {
          connected = await this.connectToExistingChrome();
        }
      }

      // Strategy 2: Launch with user profile
      if (!connected && this.options.userDataDir) {
        try {
          connected = await this.launchWithProfile();
        } catch (error) {
          console.log(`Failed to launch with profile: ${error.message}`);
        }
      }

      // Strategy 3: Try to use default Chrome profile
      if (
        !connected &&
        !this.options.userDataDir &&
        this.options.connectToExisting
      ) {
        try {
          this.options.userDataDir = this.getDefaultChromeUserDataDir();
          connected = await this.launchWithProfile();
        } catch (error) {
          console.log(
            `Failed to launch with default profile: ${error.message}`
          );
        }
      }

      // Strategy 4: Launch new Chrome instance (fallback)
      if (!connected) {
        connected = await this.launchNewChrome();
      }

      if (!connected) {
        throw new Error("Failed to initialize browser with any method");
      }

      // Get or create page
      const pages = await this.browser.pages();
      this.page = pages[0] || (await this.browser.newPage());

      // Configure page
      await this._configurePage();

      this.isInitialized = true;
      console.log("Puppeteer browser initialized successfully");
    } catch (error) {
      console.error(`Failed to initialize Puppeteer: ${error.message}`);
      await this._cleanup();
      throw new Error(`Puppeteer initialization failed: ${error.message}`);
    }
  }

  /**
   * Configure page settings and event listeners
   */
  async _configurePage() {
    // Set timeouts
    this.page.setDefaultNavigationTimeout(60000);
    this.page.setDefaultTimeout(60000);

    // Set viewport
    await this.page.setViewport(this.options.viewport);

    // Enable request interception
    await this.page.setRequestInterception(true);
    this.page.on("request", (request) => {
      try {
        request.continue();
      } catch (error) {
        console.debug(`Request interception error: ${error.message}`);
      }
    });

    // Log response errors
    this.page.on("response", (response) => {
      if (response.status() >= 400) {
        console.warn(`Response error: ${response.status()} ${response.url()}`);
      }
    });

    // Log console errors from the page
    this.page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`Page console error: ${msg.text()}`);
      }
    });
  }

  /**
   * Navigate to a URL
   * @param {string} url - The URL to navigate to
   * @param {object} options - Navigation options
   * @returns {Promise<object>} Navigation result
   */
  async navigateToUrl(url, options = {}) {
    await this.initialize();

    const navOptions = {
      waitUntil: "networkidle2",
      ...options,
    };

    try {
      await this.page.goto(url, navOptions);

      // Wait a bit for dynamic content
      await this.wait(2000);

      // Get page info
      const pageTitle = await this.page.title();
      const currentUrl = this.page.url();

      // Clear element map since we're on a new page
      this.elementMap.clear();

      return {
        success: true,
        title: pageTitle,
        url: currentUrl,
        message: `Successfully navigated to ${url}`,
      };
    } catch (error) {
      throw new Error(`Failed to navigate to ${url}: ${error.message}`);
    }
  }

  /**
   * Click on an element using its selector or reference
   * @param {string} elementRef - Element reference or selector
   * @returns {Promise<object>} Click result
   */
  async clickElement(elementRef) {
    await this.initialize();

    const selector = this.elementMap.get(elementRef) || elementRef;
    const element = await this.page.$(selector);

    if (!element) {
      throw new Error(`Element not found: ${elementRef}`);
    }

    try {
      // Store current URL to detect navigation
      const currentUrl = this.page.url();

      await element.click();

      // Wait for potential navigation
      try {
        await Promise.race([
          this.page.waitForNavigation({ timeout: 3000 }),
          this.wait(3000),
        ]);
      } catch (navigationError) {
        // Navigation timeout is fine, just continue
      }

      // Check if URL changed (indicating navigation)
      const newUrl = this.page.url();
      if (currentUrl !== newUrl) {
        this.elementMap.clear(); // Clear element map since page changed
      }

      return {
        success: true,
        message: `Successfully clicked element ${elementRef}`,
        navigationOccurred: currentUrl !== newUrl,
        newUrl: newUrl,
      };
    } catch (error) {
      throw new Error(
        `Failed to click element ${elementRef}: ${error.message}`
      );
    }
  }

  /**
   * Type text into an input element
   * @param {string} elementRef - Element reference or selector
   * @param {string} text - Text to type
   * @param {object} options - Typing options
   * @returns {Promise<object>} Type result
   */
  async typeIntoElement(elementRef, text, options = {}) {
    await this.initialize();

    const selector = this.elementMap.get(elementRef) || elementRef;
    const element = await this.page.$(selector);

    if (!element) {
      throw new Error(`Input element not found: ${elementRef}`);
    }

    try {
      // Clear existing content if specified
      if (options.clear !== false) {
        await element.click();
        await element.evaluate((el) => (el.value = ""));
      }

      // Type the text
      await element.type(text, {
        delay: options.delay || 0,
      });

      return {
        success: true,
        message: `Successfully typed "${text}" into element ${elementRef}`,
      };
    } catch (error) {
      throw new Error(
        `Failed to type into element ${elementRef}: ${error.message}`
      );
    }
  }

  /**
   * Scroll the page
   * @param {string} direction - 'up' or 'down'
   * @param {number} amount - Scroll amount in pixels (default: 500)
   * @returns {Promise<object>} Scroll result
   */
  async scrollPage(direction, amount = 500) {
    await this.initialize();

    const scrollAmount = direction.toLowerCase() === "up" ? -amount : amount;

    try {
      await this.page.evaluate((scrollBy) => {
        window.scrollBy(0, scrollBy);
      }, scrollAmount);

      await this.wait(1000); // Wait for scroll to complete

      return {
        success: true,
        message: `Scrolled ${direction} by ${Math.abs(scrollAmount)} pixels`,
      };
    } catch (error) {
      throw new Error(`Failed to scroll: ${error.message}`);
    }
  }

  /**
   * Select an option from a dropdown
   * @param {string} elementRef - Element reference or selector
   * @param {string} optionText - Option text or value to select
   * @returns {Promise<object>} Select result
   */
  async selectOption(elementRef, optionText) {
    await this.initialize();

    const selector = this.elementMap.get(elementRef) || elementRef;
    const element = await this.page.$(selector);

    if (!element) {
      throw new Error(`Dropdown element not found: ${elementRef}`);
    }

    try {
      const tagName = await element.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === "select") {
        // Handle standard select element
        const optionSelected = await element.evaluate((selectEl, text) => {
          const options = Array.from(selectEl.options);
          const targetOption = options.find(
            (option) =>
              option.text.trim().toLowerCase().includes(text.toLowerCase()) ||
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
          return {
            success: true,
            message: `Selected "${optionText}" from dropdown ${elementRef}`,
          };
        } else {
          throw new Error(`Option "${optionText}" not found in dropdown`);
        }
      } else {
        // Handle custom dropdown
        await element.click();
        await this.wait(500);

        const optionClicked = await this.page.evaluate((text) => {
          const elements = document.querySelectorAll("*");
          for (const el of elements) {
            if (
              el.textContent &&
              el.textContent.trim().toLowerCase().includes(text.toLowerCase())
            ) {
              el.click();
              return true;
            }
          }
          return false;
        }, optionText);

        if (optionClicked) {
          return {
            success: true,
            message: `Selected "${optionText}" from custom dropdown ${elementRef}`,
          };
        } else {
          throw new Error(`Could not select "${optionText}" from dropdown`);
        }
      }
    } catch (error) {
      throw new Error(`Failed to select option: ${error.message}`);
    }
  }

  /**
   * Hover over an element
   * @param {string} elementRef - Element reference or selector
   * @returns {Promise<object>} Hover result
   */
  async hoverElement(elementRef) {
    await this.initialize();

    const selector = this.elementMap.get(elementRef) || elementRef;
    const element = await this.page.$(selector);

    if (!element) {
      throw new Error(`Element not found for hover: ${elementRef}`);
    }

    try {
      await element.hover();
      await this.wait(1000);

      return {
        success: true,
        message: `Successfully hovered over element ${elementRef}`,
      };
    } catch (error) {
      throw new Error(`Failed to hover over element: ${error.message}`);
    }
  }

  /**
   * Press keyboard keys
   * @param {string} keys - Key sequence to press
   * @returns {Promise<object>} Key press result
   */
  async pressKeys(keys) {
    await this.initialize();

    try {
      if (keys.includes("+")) {
        // Handle key combinations
        const keyParts = keys.split("+");
        const modifiers = keyParts.slice(0, -1);
        const mainKey = keyParts[keyParts.length - 1];

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
      } else {
        // Single key press
        await this.page.keyboard.press(keys);
      }

      await this.wait(500);

      return {
        success: true,
        message: `Successfully pressed keys: ${keys}`,
      };
    } catch (error) {
      throw new Error(`Failed to press keys: ${error.message}`);
    }
  }

  /**
   * Clear content from an input element
   * @param {string} elementRef - Element reference or selector
   * @returns {Promise<object>} Clear result
   */
  async clearElement(elementRef) {
    await this.initialize();

    const selector = this.elementMap.get(elementRef) || elementRef;
    const element = await this.page.$(selector);

    if (!element) {
      throw new Error(`Element not found for clearing: ${elementRef}`);
    }

    try {
      await element.click();
      await this.page.keyboard.down("Control");
      await this.page.keyboard.press("a");
      await this.page.keyboard.up("Control");
      await this.page.keyboard.press("Delete");

      return {
        success: true,
        message: `Successfully cleared content from element ${elementRef}`,
      };
    } catch (error) {
      throw new Error(`Failed to clear element: ${error.message}`);
    }
  }

  /**
   * Take a screenshot
   * @param {string} filename - Optional filename (used for saving to file)
   * @param {object} options - Screenshot options
   * @returns {Promise<string|object>} Base64 string or file path, depending on returnBase64 option
   */
  async takeScreenshot(filename, options = {}) {
    await this.initialize();

    const imageType = options.type || "jpeg";
    const returnBase64 = options.returnBase64;

    try {
      // Ensure page is ready
      if (!this.page) {
        throw new Error("Browser page not initialized");
      }

      // Always save to file first
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshotName = filename || `screenshot-${timestamp}.${imageType}`;
      let filePath = path.join("screenshots", screenshotName);

      // Ensure screenshots directory exists
      const screenshotsDir = "screenshots";
      if (!fs.existsSync(screenshotsDir)) {
        try {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        } catch (error) {
          // Fallback to current directory
          filePath = screenshotName;
        }
      }

      // Prepare screenshot options
      const screenshotOptions = {
        path: filePath,
        type: imageType,
        fullPage: options.fullPage || false,
      };

      // Only add quality for JPEG
      if (imageType === "jpeg") {
        screenshotOptions.quality = options.quality || 90;
      }

      // Add clip if specified
      if (options.clip) {
        screenshotOptions.clip = options.clip;
      }

      // Take the screenshot and save to file
      await this.page.screenshot(screenshotOptions);

      // If base64 is requested, read the file and convert
      if (returnBase64) {
        try {
          const fileBuffer = fs.readFileSync(filePath);
          const base64Data = fileBuffer.toString("base64");

          if (!base64Data || base64Data.length === 0) {
            throw new Error("Failed to encode screenshot as base64");
          }

          return {
            base64: base64Data,
            mimeType: `image/${imageType}`,
            size: fileBuffer.length,
            filePath: filePath, // Include file path for reference
          };
        } catch (readError) {
          throw new Error(
            `Failed to read screenshot file for base64 conversion: ${readError.message}`
          );
        }
      } else {
        // Return file path
        return filePath;
      }
    } catch (error) {
      throw new Error(`Failed to take screenshot: ${error.message}`);
    }
  }

  /**
   * Get page content and metadata
   * @returns {Promise<object>} Page information
   */
  async getPageInfo() {
    await this.initialize();

    try {
      const title = await this.page.title();
      const url = this.page.url();
      const content = await this.page.content();

      return {
        title,
        url,
        content,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to get page info: ${error.message}`);
    }
  }

  /**
   * Execute custom JavaScript on the page
   * @param {string|function} script - JavaScript code or function to execute
   * @param {...any} args - Arguments to pass to the script
   * @returns {Promise<any>} Script execution result
   */
  async executeScript(script, ...args) {
    await this.initialize();

    try {
      return await this.page.evaluate(script, ...args);
    } catch (error) {
      throw new Error(`Failed to execute script: ${error.message}`);
    }
  }

  /**
   * Wait for a specified amount of time
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for an element to appear
   * @param {string} selector - CSS selector to wait for
   * @param {object} options - Wait options
   * @returns {Promise<object>} Wait result
   */
  async waitForElement(selector, options = {}) {
    await this.initialize();

    try {
      await this.page.waitForSelector(selector, {
        timeout: options.timeout || 30000,
        visible: options.visible !== false,
        ...options,
      });

      return {
        success: true,
        message: `Element ${selector} appeared`,
      };
    } catch (error) {
      throw new Error(`Element ${selector} did not appear: ${error.message}`);
    }
  }

  /**
   * Set element reference for later use
   * @param {string} ref - Reference name
   * @param {string} selector - CSS selector
   */
  setElementReference(ref, selector) {
    this.elementMap.set(ref, selector);
  }

  /**
   * Get element reference
   * @param {string} ref - Reference name
   * @returns {string|undefined} CSS selector
   */
  getElementReference(ref) {
    return this.elementMap.get(ref);
  }

  /**
   * Clear all element references
   */
  clearElementReferences() {
    this.elementMap.clear();
  }

  /**
   * Get current page URL
   * @returns {string} Current URL
   */
  getCurrentUrl() {
    return this.page ? this.page.url() : null;
  }

  /**
   * Get current page title
   * @returns {Promise<string>} Current page title
   */
  async getCurrentTitle() {
    await this.initialize();
    return await this.page.title();
  }

  /**
   * Check if browser is initialized
   * @returns {boolean} Initialization status
   */
  isReady() {
    return this.isInitialized && this.browser && this.page;
  }

  /**
   * Internal cleanup method
   */
  async _cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error(`Error closing browser: ${error.message}`);
      }
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Cleanup and close browser
   */
  async cleanup() {
    await this._cleanup();
    this.isInitialized = false;
    this.initializationError = null;
    this.initializationPromise = null;
    this.elementMap.clear();
  }

  /**
   * Restart the browser (cleanup and reinitialize)
   */
  async restart() {
    await this.cleanup();
    await this.initialize();
  }
}

export default PuppeteerManager;
