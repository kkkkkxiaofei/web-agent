#!/usr/bin/env node

import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugListboxProcessing() {
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

    console.log("Page loaded, testing listbox processing...");

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

    // Test the listbox processing specifically
    const debugInfo = await page.evaluate((code) => {
      // Execute the DOM hierarchy code in the browser context
      eval(code);

      const domHierarchy = new DOMHierarchy();

      // Find the listbox element
      const listbox = document.querySelector('[role="listbox"]');

      const result = {
        listboxFound: !!listbox,
        listboxInfo: null,
        optionsProcessing: [],
        processedListbox: null,
      };

      if (listbox) {
        result.listboxInfo = {
          tagName: listbox.tagName,
          role: listbox.getAttribute("role"),
          id: listbox.id,
          isVisible: domHierarchy.isVisible(listbox),
          isInteractive: domHierarchy.isInteractiveElement(listbox),
        };

        // Test option processing
        const options = listbox.querySelectorAll('[role="option"]');
        options.forEach((option, index) => {
          const optionVisible = domHierarchy.isVisible(option);
          const optionInteractive = domHierarchy.isInteractiveElement(option);
          const optionDesc = domHierarchy.getElementDescription(option);
          const optionRef = domHierarchy.getElementRef(option);

          result.optionsProcessing.push({
            index,
            text: option.textContent?.trim(),
            isVisible: optionVisible,
            isInteractive: optionInteractive,
            description: optionDesc,
            ref: optionRef,
          });
        });

        // Test full listbox processing
        result.processedListbox = domHierarchy.processInteractiveElement(
          listbox,
          0
        );
      }

      return result;
    }, domHierarchyCode);

    console.log("Listbox processing debug results:");
    console.log(JSON.stringify(debugInfo, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugListboxProcessing();
