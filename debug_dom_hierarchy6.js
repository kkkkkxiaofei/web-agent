#!/usr/bin/env node

import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugSpecificElements() {
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

    console.log("Page loaded, investigating checkboxes and select elements...");

    // Investigate specific elements
    const elementInfo = await page.evaluate(() => {
      const result = {
        checkboxes: [],
        selects: [],
        positionListItems: [],
        salaryListItems: [],
      };

      // Find all checkboxes
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox, index) => {
        result.checkboxes.push({
          index,
          id: checkbox.id,
          name: checkbox.name,
          value: checkbox.value,
          ariaLabel: checkbox.getAttribute("aria-label"),
          ariaLabelledBy: checkbox.getAttribute("aria-labelledby"),
          parentText: checkbox.parentElement?.textContent?.trim(),
          isVisible: checkbox.offsetParent !== null,
          closest: {
            listitem: !!checkbox.closest('[role="listitem"]'),
            list: !!checkbox.closest('[role="list"]'),
          },
        });
      });

      // Find all select elements
      const selects = document.querySelectorAll("select");
      selects.forEach((select, index) => {
        const options = Array.from(select.options).map((option) => ({
          value: option.value,
          text: option.textContent,
          selected: option.selected,
        }));

        result.selects.push({
          index,
          id: select.id,
          name: select.name,
          ariaLabel: select.getAttribute("aria-label"),
          ariaLabelledBy: select.getAttribute("aria-labelledby"),
          options,
          isVisible: select.offsetParent !== null,
          closest: {
            listitem: !!select.closest('[role="listitem"]'),
            list: !!select.closest('[role="list"]'),
          },
        });
      });

      // Find position list items (4th list item)
      const mainList = document.querySelector('[role="list"]');
      if (mainList) {
        const listItems = Array.from(mainList.children);
        if (listItems[3]) {
          // 4th item (0-indexed)
          const positionItem = listItems[3];
          const nestedList = positionItem.querySelector('[role="list"]');
          if (nestedList) {
            const nestedItems = Array.from(nestedList.children);
            nestedItems.forEach((item, index) => {
              const checkbox = item.querySelector('input[type="checkbox"]');
              result.positionListItems.push({
                index,
                text: item.textContent?.trim(),
                hasCheckbox: !!checkbox,
                checkboxInfo: checkbox
                  ? {
                      id: checkbox.id,
                      name: checkbox.name,
                      value: checkbox.value,
                      isVisible: checkbox.offsetParent !== null,
                    }
                  : null,
              });
            });
          }
        }

        // Find salary list item (5th list item)
        if (listItems[4]) {
          const salaryItem = listItems[4];
          const select = salaryItem.querySelector("select");
          result.salaryListItems.push({
            text: salaryItem.textContent?.trim(),
            hasSelect: !!select,
            selectInfo: select
              ? {
                  id: select.id,
                  name: select.name,
                  options: Array.from(select.options).map(
                    (opt) => opt.textContent
                  ),
                  isVisible: select.offsetParent !== null,
                }
              : null,
          });
        }
      }

      return result;
    });

    console.log("Element investigation results:");
    console.log(JSON.stringify(elementInfo, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugSpecificElements();
