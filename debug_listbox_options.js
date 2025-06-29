#!/usr/bin/env node

import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugListboxOptions() {
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

    console.log("Page loaded, investigating listbox options...");

    // Investigate listbox options
    const optionsInfo = await page.evaluate(() => {
      const result = {
        listboxes: [],
        allOptions: [],
      };

      // Find all listboxes
      const listboxes = document.querySelectorAll('[role="listbox"]');
      listboxes.forEach((listbox, index) => {
        const options = listbox.querySelectorAll('[role="option"]');
        const optionInfo = Array.from(options).map((option) => ({
          text: option.textContent?.trim(),
          isVisible: option.offsetParent !== null,
          role: option.getAttribute("role"),
          id: option.id,
        }));

        result.listboxes.push({
          index,
          id: listbox.id,
          text: listbox.textContent?.trim().substring(0, 100),
          optionCount: options.length,
          options: optionInfo,
        });
      });

      // Find all options globally
      const allOptions = document.querySelectorAll('[role="option"]');
      result.allOptions = Array.from(allOptions).map((option) => ({
        text: option.textContent?.trim(),
        isVisible: option.offsetParent !== null,
        parentListbox: !!option.closest('[role="listbox"]'),
        role: option.getAttribute("role"),
        id: option.id,
      }));

      return result;
    });

    console.log("Listbox options investigation:");
    console.log(JSON.stringify(optionsInfo, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugListboxOptions();
