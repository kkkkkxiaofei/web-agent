#!/usr/bin/env node

import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugHTMLStructure() {
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

    console.log("Page loaded, investigating HTML structure...");

    // Get the actual HTML structure
    const htmlInfo = await page.evaluate(() => {
      const result = {
        positionListHTML: "",
        salaryListHTML: "",
        allRoleElements: [],
      };

      // Get the 4th list item (position selection)
      const mainList = document.querySelector('[role="list"]');
      if (mainList) {
        const listItems = Array.from(mainList.children);
        if (listItems[3]) {
          result.positionListHTML = listItems[3].outerHTML;
        }
        if (listItems[4]) {
          result.salaryListHTML = listItems[4].outerHTML;
        }
      }

      // Find all elements with role attributes
      const roleElements = document.querySelectorAll("[role]");
      roleElements.forEach((el) => {
        const role = el.getAttribute("role");
        if (
          ["checkbox", "radio", "listbox", "option", "combobox"].includes(role)
        ) {
          result.allRoleElements.push({
            role,
            tagName: el.tagName,
            id: el.id,
            ariaLabel: el.getAttribute("aria-label"),
            ariaLabelledBy: el.getAttribute("aria-labelledby"),
            text: el.textContent?.trim().substring(0, 50),
            isVisible: el.offsetParent !== null,
          });
        }
      });

      return result;
    });

    console.log("Position list HTML structure:");
    console.log(htmlInfo.positionListHTML.substring(0, 1000) + "...");

    console.log("\nSalary list HTML structure:");
    console.log(htmlInfo.salaryListHTML.substring(0, 1000) + "...");

    console.log("\nAll role-based form elements:");
    console.log(JSON.stringify(htmlInfo.allRoleElements, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugHTMLStructure();
