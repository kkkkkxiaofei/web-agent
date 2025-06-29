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

    console.log("Page loaded, debugging highlighted elements...");

    // Debug: Find all elements with gbt_link_text
    const highlightedElements = await page.evaluate(() => {
      const elements = document.querySelectorAll("[gbt_link_text]");
      return Array.from(elements).map((el) => ({
        tagName: el.tagName,
        type: el.type,
        gbt_link_text: el.getAttribute("gbt_link_text"),
        textContent: el.textContent?.trim().substring(0, 50) || "",
        id: el.id,
        className: el.className,
        isVisible: el.offsetWidth > 0 && el.offsetHeight > 0,
        computedStyle: {
          display: window.getComputedStyle(el).display,
          visibility: window.getComputedStyle(el).visibility,
          opacity: window.getComputedStyle(el).opacity,
        },
        boundingRect: el.getBoundingClientRect(),
      }));
    });

    console.log("Found highlighted elements:");
    highlightedElements.forEach((el, i) => {
      console.log(
        `${i + 1}. ${el.tagName} [gbt_link_text="${el.gbt_link_text}"]`
      );
      console.log(`   Type: ${el.type || "N/A"}`);
      console.log(`   Text: "${el.textContent}"`);
      console.log(`   Visible: ${el.isVisible}`);
      console.log(`   Display: ${el.computedStyle.display}`);
      console.log(`   Rect: ${JSON.stringify(el.boundingRect)}`);
      console.log("");
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
