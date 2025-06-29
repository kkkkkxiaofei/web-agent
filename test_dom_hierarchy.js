#!/usr/bin/env node

import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDOMHierarchy() {
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

    console.log("Page loaded, generating DOM hierarchy...");

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

    // Generate DOM hierarchy using the extracted class
    const hierarchyData = await page.evaluate((code) => {
      // Execute the DOM hierarchy code in the browser context
      eval(code);

      const domHierarchy = new DOMHierarchy();
      const hierarchyString = domHierarchy.generateHierarchy();

      // Convert elementMap to serializable format
      const elementMapArray = Array.from(domHierarchy.elementMap.entries()).map(
        ([key, element]) => {
          return [
            key,
            {
              tagName: element.tagName,
              id: element.id,
              className: element.className,
              textContent: element.textContent
                ? element.textContent.substring(0, 100)
                : "",
              attributes: Array.from(element.attributes || []).reduce(
                (acc, attr) => {
                  acc[attr.name] = attr.value;
                  return acc;
                },
                {}
              ),
            },
          ];
        }
      );

      return {
        hierarchy: hierarchyString,
        elementMap: elementMapArray,
      };
    }, domHierarchyCode);

    console.log("DOM Hierarchy generated successfully!");

    const output = `
================================================================================
GENERATED DOM HIERARCHY:
================================================================================
${hierarchyData.hierarchy}

================================================================================
ELEMENT MAP:
================================================================================
${JSON.stringify(hierarchyData.elementMap, null, 2)}
`;

    console.log(output);

    // Save to file for comparison
    const outputFile = path.join(__dirname, "dom_hierarchy.actual");
    fs.writeFileSync(outputFile, output);
    console.log(`Result saved to: ${outputFile}`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testDOMHierarchy();
