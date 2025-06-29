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

    console.log("Page loaded, testing refactored DOM hierarchy...");

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

    // Test the refactored DOM hierarchy
    const debugInfo = await page.evaluate((code) => {
      // Execute the DOM hierarchy code in the browser context
      eval(code);

      const domHierarchy = new DOMHierarchy();

      // Test processing of the main list
      const mainList = document.querySelector('[role="list"]');

      const result = {
        mainListFound: !!mainList,
        mainListInfo: null,
        processedResult: null,
        fullHierarchy: null,
      };

      if (mainList) {
        result.mainListInfo = {
          tagName: mainList.tagName,
          role: mainList.getAttribute("role"),
          children: mainList.children.length,
          isVisible: domHierarchy.isVisible(mainList),
        };

        result.processedResult = domHierarchy.processList(mainList, 0);
      }

      // Test full hierarchy generation
      try {
        result.fullHierarchy = domHierarchy.generateHierarchy();
      } catch (error) {
        result.fullHierarchy = { error: error.message };
      }

      return result;
    }, domHierarchyCode);

    console.log("Debug results:");
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
