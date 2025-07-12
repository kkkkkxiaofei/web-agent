const puppeteer = require("puppeteer");
const fs = require("fs");

async function takeScreenshot(url, timeout = 30000) {
  let browser;
  try {
    console.log("Launching browser...");

    // Launch browser with simplified configuration
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--no-first-run",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
      // Increase timeout for browser launch
      timeout: 60000,
    });

    console.log("Browser launched successfully");

    // Create new page
    const page = await browser.newPage();

    // Wait a moment for page to initialize properly
    console.log("Initializing page...");
    await page.waitForTimeout(1000);

    // Set viewport size
    await page.setViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    });

    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set timeout with more generous values
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    // Add error handling for page events
    page.on("error", (error) => {
      console.log("Page error:", error.message);
    });

    page.on("pageerror", (error) => {
      console.log("Page script error:", error.message);
    });

    // Wait a bit more to ensure page is ready
    await page.waitForTimeout(500);

    // Navigate to URL with progressive fallback
    console.log(`Navigating to: ${url}`);

    let navigationSuccessful = false;
    let lastError = null;

    // Try navigation with different strategies
    const strategies = [
      async () => {
        console.log("Trying direct navigation...");
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeout,
        });
      },
      async () => {
        console.log("Trying with networkidle2...");
        await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: timeout,
        });
      },
      async () => {
        console.log("Trying with load event...");
        await page.goto(url, {
          waitUntil: "load",
          timeout: timeout,
        });
      },
      async () => {
        console.log("Trying minimal navigation...");
        await page.goto(url, {
          timeout: timeout,
        });
      },
    ];

    for (let strategy of strategies) {
      if (navigationSuccessful) break;

      try {
        await strategy();
        navigationSuccessful = true;
        console.log("Navigation successful!");
      } catch (navigationError) {
        console.log(`Strategy failed: ${navigationError.message}`);
        lastError = navigationError;
        // Wait a bit before trying next strategy
        await page.waitForTimeout(1000);
      }
    }

    if (!navigationSuccessful) {
      throw lastError || new Error("All navigation strategies failed");
    }

    // Wait for page to stabilize
    console.log("Waiting for page to stabilize...");
    await page.waitForTimeout(3000);

    // Take screenshot
    console.log("Taking screenshot...");
    await page.screenshot({
      path: "screenshot.jpg",
      fullPage: false,
      quality: 90,
    });

    console.log("Screenshot saved as screenshot.jpg");

    // Verify the file was created
    if (fs.existsSync("screenshot.jpg")) {
      const stats = fs.statSync("screenshot.jpg");
      console.log(`Screenshot file size: ${stats.size} bytes`);
    }
  } catch (error) {
    console.error("Error taking screenshot:", error.message);
    if (error.stack) {
      console.error("Error stack:", error.stack);
    }
    throw error;
  } finally {
    if (browser) {
      console.log("Closing browser...");
      try {
        await browser.close();
      } catch (closeError) {
        console.log("Error closing browser:", closeError.message);
      }
    }
  }
}

// Main execution
async function main() {
  const url = process.argv[2];
  const timeout = process.argv[3] ? parseInt(process.argv[3]) : 45000; // Increased default timeout

  if (!url) {
    console.error("Usage: node screenshot.js <URL> [timeout_ms]");
    process.exit(1);
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (urlError) {
    console.error("Invalid URL format:", url);
    process.exit(1);
  }

  try {
    await takeScreenshot(url, timeout);
    console.log("Screenshot completed successfully");
  } catch (error) {
    console.error("Failed to take screenshot:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { takeScreenshot };
