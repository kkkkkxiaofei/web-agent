const puppeteer = require("puppeteer");
const fs = require("fs");
const readline = require("readline");
const { OpenAI } = require("openai");
require("dotenv").config();

class WebAgent {
  constructor() {
    this.browser = null;
    this.page = null;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.conversationHistory = [];
    this.systemMessage = `You are an AI web browsing agent. You can see screenshots of web pages and interact with them.
        
Available actions:
1. CLICK:[element_id] - Click on an element with the specified gbt_link_text attribute
2. TYPE:[element_id]:[text] - Type text into an input field
3. FETCH:[url] - Navigate to a new URL
4. SCROLL:[direction] - Scroll up or down (direction: up/down)
5. ANALYZE - Just analyze the current page without taking action
6. COMPLETE - Task is finished

When you see highlighted elements on the page, they have yellow borders and numbers. Use these numbers as element_ids for clicking or typing.
Always explain what you see and what action you're taking.`;
  }

  async initialize() {
    console.log("Initializing web agent...");

    this.browser = await puppeteer.launch({
      headless: false, // Set to true for headless mode
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
      ],
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    });

    console.log("Web agent initialized successfully");
  }

  encodeImageToBase64(imagePath) {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      return imageBuffer.toString("base64");
    } catch (error) {
      throw new Error(`Failed to encode image: ${error.message}`);
    }
  }

  async takeScreenshot(filename = "current_page.jpg") {
    try {
      await this.page.screenshot({
        path: filename,
        fullPage: false,
        quality: 90,
      });
      console.log(` Screenshot saved as ${filename}`);
      return filename;
    } catch (error) {
      throw new Error(`Failed to take screenshot: ${error.message}`);
    }
  }

  async highlightLinks() {
    console.log("Highlighting interactive elements...");

    // Remove any existing highlights and get interactive elements
    const elements = await this.page.evaluate(() => {
      // Remove previous highlights
      const existingHighlights = document.querySelectorAll(
        "[data-gbt-highlight]"
      );
      existingHighlights.forEach((el) => {
        el.style.border = "";
        el.style.position = "";
        el.removeAttribute("data-gbt-highlight");
        el.removeAttribute("gbt_link_text");
      });

      // Remove previous number overlays
      const existingNumbers = document.querySelectorAll(".gbt-element-number");
      existingNumbers.forEach((el) => el.remove());

      // Find all interactive elements
      const selectors = [
        "a[href]",
        "button",
        'input:not([type="hidden"])',
        "textarea",
        "select",
        "[onclick]",
        '[role="button"]',
        '[role="link"]',
        "[tabindex]",
      ];

      const interactiveElements = [];

      selectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          if (!interactiveElements.includes(el)) {
            interactiveElements.push(el);
          }
        });
      });

      // Filter visible and in-viewport elements
      const visibleElements = interactiveElements.filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0"
        );
      });

      // Highlight and number the elements
      const elementData = [];
      visibleElements.forEach((el, index) => {
        const elementId = index + 1;

        // Set attributes
        el.setAttribute("gbt_link_text", elementId.toString());
        el.setAttribute("data-gbt-highlight", "true");

        // Add yellow border
        el.style.border = "3px solid #FFD700";
        el.style.position = "relative";
        el.style.zIndex = "1000";

        // Create number overlay
        const numberOverlay = document.createElement("div");
        numberOverlay.className = "gbt-element-number";
        numberOverlay.textContent = elementId.toString();
        numberOverlay.style.cssText = `
                    position: absolute;
                    top: -8px;
                    left: -8px;
                    background: #FFD700;
                    color: black;
                    font-size: 12px;
                    font-weight: bold;
                    padding: 2px 6px;
                    border-radius: 10px;
                    z-index: 10000;
                    min-width: 20px;
                    text-align: center;
                `;

        // Position the overlay relative to the element
        if (el.style.position === "static" || !el.style.position) {
          el.style.position = "relative";
        }
        el.appendChild(numberOverlay);

        // Get element info
        const rect = el.getBoundingClientRect();
        const tagName = el.tagName.toLowerCase();
        const text = el.textContent?.trim().substring(0, 50) || "";
        const href = el.href || "";
        const placeholder = el.placeholder || "";
        const type = el.type || "";

        elementData.push({
          id: elementId,
          tagName,
          text,
          href,
          placeholder,
          type,
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      });

      return elementData;
    });

    console.log(`Highlighted ${elements.length} interactive elements`);
    return elements;
  }

  async performAction(action, page) {
    console.log(`Performing action: ${action}`);

    try {
      if (action.startsWith("CLICK:")) {
        const elementId = action.replace("CLICK:", "").trim();
        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.click();
          console.log(`Clicked element ${elementId}`);
          await this.page.waitForTimeout(2000); // Wait for page changes
          return true;
        } else {
          console.log(`Element ${elementId} not found`);
          return false;
        }
      } else if (action.startsWith("TYPE:")) {
        const parts = action.replace("TYPE:", "").split(":");
        const elementId = parts[0].trim();
        const text = parts.slice(1).join(":").trim();

        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.click(); // Focus the element
          await element.clear(); // Clear existing text
          await element.type(text);
          console.log(`Typed "${text}" into element ${elementId}`);
          return true;
        } else {
          console.log(`Input element ${elementId} not found`);
          return false;
        }
      } else if (action.startsWith("FETCH:")) {
        const url = action.replace("FETCH:", "").trim();
        await this.page.goto(url, { waitUntil: "networkidle2" });
        console.log(`Navigated to: ${url}`);
        await this.page.waitForTimeout(2000);
        return true;
      } else if (action.startsWith("SCROLL:")) {
        const direction = action.replace("SCROLL:", "").trim().toLowerCase();
        const scrollAmount = direction === "up" ? -500 : 500;

        await this.page.evaluate((amount) => {
          window.scrollBy(0, amount);
        }, scrollAmount);

        console.log(`Scrolled ${direction}`);
        await this.page.waitForTimeout(1000);
        return true;
      } else if (action === "ANALYZE" || action === "COMPLETE") {
        return true; // No action needed
      }

      return false;
    } catch (error) {
      console.error(`Error performing action: ${error.message}`);
      return false;
    }
  }

  async analyzeWithGPT4V(imagePath, userPrompt = null) {
    try {
      const base64Image = this.encodeImageToBase64(imagePath);

      const messages = [
        {
          role: "system",
          content: this.systemMessage,
        },
        ...this.conversationHistory,
      ];

      if (userPrompt) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: userPrompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        });
      } else {
        messages.push({
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        });
      }

      const response = await this.openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: messages,
        max_tokens: 1000,
        temperature: 0.1,
      });

      const aiResponse = response.choices[0].message.content;

      // Update conversation history
      if (userPrompt) {
        this.conversationHistory.push({
          role: "user",
          content: userPrompt + " [Image provided]",
        });
      }
      this.conversationHistory.push({
        role: "assistant",
        content: aiResponse,
      });

      // Keep conversation history manageable
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      return aiResponse;
    } catch (error) {
      throw new Error(`GPT-4V analysis failed: ${error.message}`);
    }
  }

  async startInteractiveSession() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n=== AI Web Agent Started ===");
    console.log("Available commands:");
    console.log("- Enter a URL to navigate");
    console.log("- Ask questions about the current page");
    console.log('- Type "quit" to exit');
    console.log("================================\n");

    const askQuestion = () => {
      rl.question("You: ", async (input) => {
        if (input.toLowerCase() === "quit") {
          console.log("Goodbye!");
          await this.cleanup();
          rl.close();
          return;
        }

        try {
          // Check if input is a URL
          if (input.startsWith("http://") || input.startsWith("https://")) {
            await this.page.goto(input, { waitUntil: "networkidle2" });
            console.log(`Navigated to: ${input}`);
            await this.page.waitForTimeout(2000);
          }

          // Highlight interactive elements
          const elements = await this.highlightLinks();

          // Take screenshot
          const screenshotPath = await this.takeScreenshot();

          // Analyze with GPT-4V
          console.log("AI is analyzing the page...");
          const aiResponse = await this.analyzeWithGPT4V(screenshotPath, input);

          console.log(`\nAI Agent: ${aiResponse}\n`);

          // Check if AI wants to perform an action
          const actionMatch = aiResponse.match(
            /(CLICK|TYPE|FETCH|SCROLL):[^\n]*/
          );
          if (actionMatch) {
            const action = actionMatch[0];
            console.log(`Executing action: ${action}`);

            const success = await this.performAction(action, this.page);
            if (success) {
              console.log("Action completed successfully");
              // Take new screenshot after action
              await this.page.waitForTimeout(2000);
              await this.highlightLinks();
              await this.takeScreenshot();
            } else {
              console.log("Action failed");
            }
          }
        } catch (error) {
          console.error(`Error: ${error.message}`);
        }

        askQuestion(); // Continue the conversation
      });
    };

    askQuestion();
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      console.log("Browser closed");
    }
  }
}

// Main execution
async function main() {
  const agent = new WebAgent();

  try {
    await agent.initialize();
    await agent.startInteractiveSession();
  } catch (error) {
    console.error("Error starting web agent:", error.message);
    await agent.cleanup();
    process.exit(1);
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down gracefully...");
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = WebAgent;
