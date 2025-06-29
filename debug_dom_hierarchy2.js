#!/usr/bin/env node

import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugDOMHierarchy() {
  let browser;

  try {
    console.log("Starting browser...");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Navigate to the local index.html file
    const indexPath = `file://${path.join(__dirname, "index.html")}`;
    console.log(`Navigating to: ${indexPath}`);

    await page.goto(indexPath, { waitUntil: "networkidle0" });

    console.log("Page loaded, testing DOM hierarchy processing...");

    // Read and inject the DOM hierarchy class into the page
    let domHierarchyCode = fs.readFileSync(
      path.join(__dirname, "dom_hierarchy.js"),
      "utf8"
    );

    // Remove ES module export for browser compatibility
    domHierarchyCode = domHierarchyCode.replace(
      /export default DOMHierarchy;/g,
      ""
    );

    // Debug: Test specific elements
    const debugInfo = await page.evaluate((code) => {
      // Execute the DOM hierarchy code in the browser context
      eval(code);

      const domHierarchy = new DOMHierarchy();

      // Test specific input elements
      const input3 = document.querySelector('[gbt_link_text="3"]');
      const input4 = document.querySelector('[gbt_link_text="4"]');

      const results = {
        input3: null,
        input4: null,
        input3_processed: null,
        input4_processed: null,
      };

      if (input3) {
        results.input3 = {
          tagName: input3.tagName,
          type: input3.type,
          isInteractive: domHierarchy.isInteractiveElement(input3),
          isVisible: domHierarchy.isVisible(input3),
          shouldInclude: domHierarchy.shouldIncludeElement(input3),
          description: domHierarchy.getElementDescription(input3),
          parentTagName: input3.parentElement?.tagName,
          parentHasGbtText: input3.parentElement?.hasAttribute("gbt_link_text"),
        };

        results.input3_processed = domHierarchy.processElement(input3, 0);
      }

      if (input4) {
        results.input4 = {
          tagName: input4.tagName,
          type: input4.type,
          isInteractive: domHierarchy.isInteractiveElement(input4),
          isVisible: domHierarchy.isVisible(input4),
          shouldInclude: domHierarchy.shouldIncludeElement(input4),
          description: domHierarchy.getElementDescription(input4),
          parentTagName: input4.parentElement?.tagName,
          parentHasGbtText: input4.parentElement?.hasAttribute("gbt_link_text"),
        };

        results.input4_processed = domHierarchy.processElement(input4, 0);
      }

      return results;
    }, domHierarchyCode);

    console.log("Debug info for input elements:");
    console.log(JSON.stringify(debugInfo, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugDOMHierarchy();
