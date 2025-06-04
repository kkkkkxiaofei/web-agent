const puppeteer = require("puppeteer");
const fs = require("fs");

async function takeScreenshot(url, timeout = 30000) {
  let browser;
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
      ],
    });

    // Create new page
    const page = await browser.newPage();

    // Set viewport size
    await page.setViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    });

    // Set timeout
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    // Navigate to URL
    console.log(`Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: timeout,
    });

    // Wait a bit more for dynamic content
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({
      path: "screenshot.jpg",
      fullPage: false,
      quality: 90,
    });

    console.log("Screenshot saved as screenshot.jpg");
  } catch (error) {
    console.error("Error taking screenshot:", error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Main execution
async function main() {
  const url = process.argv[2];
  const timeout = process.argv[3] ? parseInt(process.argv[3]) : 30000;

  if (!url) {
    console.error("Usage: node screenshot.js <URL> [timeout_ms]");
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
