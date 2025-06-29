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

    console.log("Page loaded, checking input element accessibility...");

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

    // Debug: Check path from body to input elements
    const debugInfo = await page.evaluate((code) => {
      // Execute the DOM hierarchy code in the browser context
      eval(code);

      const domHierarchy = new DOMHierarchy();

      // Find input elements
      const input3 = document.querySelector('[gbt_link_text="3"]');
      const input4 = document.querySelector('[gbt_link_text="4"]');

      const getElementPath = (el) => {
        const path = [];
        let current = el;
        let depth = 0;

        while (current && current !== document.body && depth < 20) {
          path.unshift({
            tagName: current.tagName,
            id: current.id,
            className: current.className,
            gbt_link_text: current.getAttribute("gbt_link_text"),
            isVisible: domHierarchy.isVisible(current),
            isInteractive: domHierarchy.isInteractiveElement(current),
            shouldInclude: domHierarchy.shouldIncludeElement(current),
          });
          current = current.parentElement;
          depth++;
        }

        return { path, depth };
      };

      const results = {};

      if (input3) {
        results.input3 = {
          element: {
            tagName: input3.tagName,
            type: input3.type,
            gbt_link_text: input3.getAttribute("gbt_link_text"),
            isVisible: domHierarchy.isVisible(input3),
            isInteractive: domHierarchy.isInteractiveElement(input3),
            shouldInclude: domHierarchy.shouldIncludeElement(input3),
          },
          pathFromBody: getElementPath(input3),
        };
      }

      if (input4) {
        results.input4 = {
          element: {
            tagName: input4.tagName,
            type: input4.type,
            gbt_link_text: input4.getAttribute("gbt_link_text"),
            isVisible: domHierarchy.isVisible(input4),
            isInteractive: domHierarchy.isInteractiveElement(input4),
            shouldInclude: domHierarchy.shouldIncludeElement(input4),
          },
          pathFromBody: getElementPath(input4),
        };
      }

      return results;
    }, domHierarchyCode);

    console.log("Input element analysis:");
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
