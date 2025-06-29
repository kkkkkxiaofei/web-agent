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

    console.log("Page loaded, tracing DOM hierarchy processing...");

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

    // Debug: Trace all elements with gbt_link_text during processing
    const debugInfo = await page.evaluate((code) => {
      // Execute the DOM hierarchy code in the browser context
      eval(code);

      // Override the processElement method to add logging
      const domHierarchy = new DOMHierarchy();
      const originalProcessElement =
        domHierarchy.processElement.bind(domHierarchy);

      const processedElements = [];

      domHierarchy.processElement = function (el, depth = 0) {
        const gbtText = el.getAttribute("gbt_link_text");
        if (gbtText) {
          processedElements.push({
            gbt_link_text: gbtText,
            tagName: el.tagName,
            type: el.type,
            textContent: el.textContent?.trim().substring(0, 50) || "",
            depth: depth,
            isInteractive: this.isInteractiveElement(el),
            isVisible: this.isVisible(el),
            shouldInclude: this.shouldIncludeElement(el),
          });
        }

        return originalProcessElement(el, depth);
      };

      // Generate hierarchy
      const result = domHierarchy.generateHierarchy();

      return {
        processedElements: processedElements,
        elementMap: result.elementMap,
      };
    }, domHierarchyCode);

    console.log("Elements with gbt_link_text processed:");
    debugInfo.processedElements.forEach((el, i) => {
      console.log(
        `${i + 1}. ${el.tagName} [gbt_link_text="${el.gbt_link_text}"] depth=${
          el.depth
        }`
      );
      console.log(`   Type: ${el.type || "N/A"}`);
      console.log(`   Text: "${el.textContent}"`);
      console.log(
        `   Interactive: ${el.isInteractive}, Visible: ${el.isVisible}, ShouldInclude: ${el.shouldInclude}`
      );
      console.log("");
    });

    console.log("Final element map:");
    debugInfo.elementMap.forEach(([ref, selector]) => {
      console.log(`  ${ref}: ${selector}`);
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugDOMHierarchy();
