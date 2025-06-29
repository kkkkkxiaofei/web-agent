#!/usr/bin/env node

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PageHierarchy from "./page_hierarchy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testIndexHtml() {
  let browser;

  try {
    console.log("🚀 Starting test of index.html...\n");

    browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 1280, height: 800 },
    });

    const page = await browser.newPage();

    // Load the index.html file
    const htmlPath = path.join(__dirname, "index.html");
    const htmlContent = fs.readFileSync(htmlPath, "utf8");
    await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

    console.log("📄 Loaded index.html successfully");
    console.log("🔍 Generating page snapshot...\n");

    // Create a mock logger for the PageHierarchy class
    const mockLogger = {
      info: () => {},
      error: () => {},
      debug: () => {},
      success: () => {},
      warning: () => {},
    };

    // Create elementMap to store element references
    const elementMap = new Map();

    // Create PageHierarchy instance
    const pageHierarchy = new PageHierarchy(page, elementMap, mockLogger);

    // Generate page hierarchy using our actual PageHierarchy class
    const result = await pageHierarchy.summarizePageHierarchy();

    console.log("📊 Page Snapshot Results:");
    console.log("=".repeat(80));
    console.log(result);
    console.log("=".repeat(80));

    console.log(`\n🎯 Found ${elementMap.size} interactive elements`);
    console.log(`\n🔗 Element Map (first 10):`);

    const elementMapEntries = Array.from(elementMap.entries());
    elementMapEntries.slice(0, 10).forEach(([ref, selector]) => {
      console.log(`  ${ref}: ${selector}`);
    });

    if (elementMapEntries.length > 10) {
      console.log(`  ... and ${elementMapEntries.length - 10} more elements`);
    }

    console.log("\n✅ Test completed successfully!");

    // Keep browser open for 5 seconds to see the page
    console.log("\n⏱️  Keeping browser open for 5 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      // await browser.close();
    }
  }
}

// Run the test
testIndexHtml();
