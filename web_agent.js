const puppeteer = require("puppeteer");
const fs = require("fs");
const readline = require("readline");
const Anthropic = require("@anthropic-ai/sdk");
const Logger = require("./logger");
const Prompts = require("./prompts");
require("dotenv").config();

const PROCESS_ID = new Date().toISOString();

if (!fs.existsSync(`logs/${PROCESS_ID}`)) {
  fs.mkdirSync(`logs/${PROCESS_ID}`, { recursive: true });
}

class WebAgent {
  constructor() {
    this.browser = null;
    this.page = null;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.conversationHistory = [];
    this.fullConversationHistory = []; // Store complete history for logging
    this.currentTask = null;
    this.taskSteps = [];
    this.currentStepIndex = 0;
    this.taskCompleted = false;

    // Initialize logger
    this.logger = new Logger({
      logFile: `logs/${PROCESS_ID}/web_agent.log`,
      showInTerminal: true,
    });

    this.systemMessage = Prompts.getSystemMessage();
  }

  async initialize() {
    this.logger.info("Initializing web agent...");

    // Log verification status
    const verificationEnabled = process.env.ENABLE_VERIFICATION === "true";
    this.logger.info(
      `Step verification: ${
        verificationEnabled ? "ENABLED" : "DISABLED"
      } (ENABLE_VERIFICATION=${process.env.ENABLE_VERIFICATION || "false"})`
    );

    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--single-process",
        "--disable-web-security",
        "--ignore-certificate-errors",
        "--disable-features=IsolateOrigins",
        "--disable-site-isolation-trials",
        "--allow-running-insecure-content",
        "--start-maximized",
      ],
      // Increase timeout for browser launch
      timeout: 60000,
    });

    const pages = await this.browser.pages();
    this.page = pages[0]; // Use the first (default) page

    // Ensure the page is properly initialized
    if (!this.page) {
      this.page = await this.browser.newPage();
    }

    await this.page.setViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    });

    this.logger.success("Web agent initialized successfully");
  }

  encodeImageToBase64(imagePath) {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      return imageBuffer.toString("base64");
    } catch (error) {
      throw new Error(`Failed to encode image: ${error.message}`);
    }
  }

  async takeScreenshot(
    filename,
    isSubTask = false,
    subTaskIndex = null,
    parentStepIndex = null
  ) {
    let uniqFilename;

    if (filename) {
      // Custom filename provided
      uniqFilename = filename;
    } else if (isSubTask && subTaskIndex !== null && parentStepIndex !== null) {
      // Subtask screenshot: parentStep_sub_subIndex_current_page.jpg
      uniqFilename = `${parentStepIndex}_sub_${subTaskIndex}_current_page.jpg`;
    } else {
      // Regular step screenshot
      uniqFilename = `${this.currentStepIndex}_current_page.jpg`;
    }

    const filePath = `logs/${PROCESS_ID}/${uniqFilename}`;
    try {
      await this.page.screenshot({
        path: filePath,
        fullPage: false,
        quality: 90,
      });
      this.logger.debug(`Screenshot saved as ${filePath}`);
      return filePath;
    } catch (error) {
      throw new Error(`Failed to take screenshot: ${error.message}`);
    }
  }

  async highlightLinks() {
    this.logger.debug("Highlighting interactive elements...");

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

        // Position the overlay - handle input elements differently since they can't have children
        if (
          el.tagName.toLowerCase() === "input" ||
          el.tagName.toLowerCase() === "textarea" ||
          el.tagName.toLowerCase() === "select"
        ) {
          // For input elements, position overlay absolutely relative to document
          const rect = el.getBoundingClientRect();
          const scrollLeft =
            window.pageXOffset || document.documentElement.scrollLeft;
          const scrollTop =
            window.pageYOffset || document.documentElement.scrollTop;

          numberOverlay.style.position = "fixed";
          numberOverlay.style.top = rect.top - 8 + "px";
          numberOverlay.style.left = rect.left - 8 + "px";
          numberOverlay.style.zIndex = "10000";

          // Add to document body instead of element
          document.body.appendChild(numberOverlay);
        } else {
          // For other elements, use relative positioning as before
          if (el.style.position === "static" || !el.style.position) {
            el.style.position = "relative";
          }
          el.appendChild(numberOverlay);
        }

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
    this.logger.info(`Performing action: ${action}`);

    try {
      if (action.startsWith("CLICK:")) {
        const elementId = action.replace("CLICK:", "").trim();
        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.click();
          this.logger.success(`Clicked element ${elementId}`);
          await this.waitFor(2000); // Wait for page changes
          return true;
        } else {
          this.logger.warning(`Element ${elementId} not found`);
          return false;
        }
      } else if (action.startsWith("TYPE:")) {
        const parts = action.replace("TYPE:", "").split(":");
        const elementId = parts[0].trim();
        const text = parts.slice(1).join(":").trim();

        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.click(); // Focus the element
          // Clear existing text by setting value to empty string
          await element.evaluate((el) => (el.value = ""));
          await element.type(text);
          this.logger.success(`Typed "${text}" into element ${elementId}`);
          return true;
        } else {
          this.logger.warning(`Input element ${elementId} not found`);
          return false;
        }
      } else if (action.startsWith("FETCH:")) {
        const url = action.replace("FETCH:", "").trim();
        await this.page.goto(url, { waitUntil: "networkidle2" });
        this.logger.success(`Navigated to: ${url}`);
        await this.waitFor(2000);
        return true;
      } else if (action.startsWith("SCROLL:")) {
        const direction = action.replace("SCROLL:", "").trim().toLowerCase();
        const scrollAmount = direction === "up" ? -500 : 500;

        await this.page.evaluate((amount) => {
          window.scrollBy(0, amount);
        }, scrollAmount);

        this.logger.success(`Scrolled ${direction}`);
        await this.waitFor(1000);
        return true;
      } else if (action.startsWith("SELECT:")) {
        const parts = action.replace("SELECT:", "").split(":");
        const elementId = parts[0].trim();
        const optionText = parts.slice(1).join(":").trim();

        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          try {
            // Try different selection methods
            const tagName = await element.evaluate((el) =>
              el.tagName.toLowerCase()
            );

            if (tagName === "select") {
              // For <select> elements, try to select by visible text
              const optionSelected = await element.evaluate(
                (selectEl, text) => {
                  const options = Array.from(selectEl.options);
                  const targetOption = options.find(
                    (option) =>
                      option.text
                        .trim()
                        .toLowerCase()
                        .includes(text.toLowerCase()) ||
                      option.value.toLowerCase().includes(text.toLowerCase())
                  );

                  if (targetOption) {
                    selectEl.value = targetOption.value;
                    selectEl.dispatchEvent(
                      new Event("change", { bubbles: true })
                    );
                    return true;
                  }
                  return false;
                },
                optionText
              );

              if (optionSelected) {
                this.logger.success(
                  `Selected "${optionText}" from dropdown ${elementId}`
                );
                await this.waitFor(1000);
                return true;
              } else {
                this.logger.warning(
                  `Option "${optionText}" not found in dropdown ${elementId}`
                );
                return false;
              }
            } else {
              // For other elements (like custom dropdowns), try clicking
              await element.click();
              await this.waitFor(500);

              // Look for the option to click
              const optionClicked = await this.page.evaluate((text) => {
                const elements = document.querySelectorAll("*");
                for (const el of elements) {
                  if (
                    el.textContent &&
                    el.textContent
                      .trim()
                      .toLowerCase()
                      .includes(text.toLowerCase())
                  ) {
                    el.click();
                    return true;
                  }
                }
                return false;
              }, optionText);

              if (optionClicked) {
                this.logger.success(
                  `Selected "${optionText}" from dropdown ${elementId}`
                );
                await this.waitFor(1000);
                return true;
              } else {
                this.logger.warning(
                  `Could not select "${optionText}" from dropdown ${elementId}`
                );
                return false;
              }
            }
          } catch (error) {
            this.logger.warning(
              `Error selecting from dropdown: ${error.message}`
            );
            return false;
          }
        } else {
          this.logger.warning(`Dropdown element ${elementId} not found`);
          return false;
        }
      } else if (action.startsWith("HOVER:")) {
        const elementId = action.replace("HOVER:", "").trim();
        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.hover();
          this.logger.success(`Hovered over element ${elementId}`);
          await this.waitFor(1000); // Wait for hover effects
          return true;
        } else {
          this.logger.warning(`Element ${elementId} not found for hover`);
          return false;
        }
      } else if (action.startsWith("PRESS:")) {
        const keySequence = action.replace("PRESS:", "").trim();

        // Handle key combinations (e.g., Ctrl+A, Ctrl+C)
        if (keySequence.includes("+")) {
          const keys = keySequence.split("+");
          const modifiers = keys.slice(0, -1);
          const mainKey = keys[keys.length - 1];

          // Build modifier object
          const options = {};
          if (modifiers.includes("Ctrl") || modifiers.includes("Control")) {
            options.ctrlKey = true;
          }
          if (modifiers.includes("Shift")) {
            options.shiftKey = true;
          }
          if (modifiers.includes("Alt")) {
            options.altKey = true;
          }
          if (modifiers.includes("Meta") || modifiers.includes("Cmd")) {
            options.metaKey = true;
          }

          await this.page.keyboard.press(mainKey, options);
          this.logger.success(`Pressed key combination: ${keySequence}`);
        } else {
          // Single key press
          await this.page.keyboard.press(keySequence);
          this.logger.success(`Pressed key: ${keySequence}`);
        }

        await this.waitFor(500);
        return true;
      } else if (action.startsWith("WAIT:")) {
        const seconds = parseFloat(action.replace("WAIT:", "").trim());

        if (isNaN(seconds) || seconds <= 0) {
          this.logger.warning(`Invalid wait time: ${seconds}`);
          return false;
        }

        this.logger.info(`Waiting ${seconds} seconds...`);
        await this.waitFor(seconds * 1000);
        this.logger.success(`Waited ${seconds} seconds`);
        return true;
      } else if (action.startsWith("CLEAR:")) {
        const elementId = action.replace("CLEAR:", "").trim();
        const element = await this.page.$(`[gbt_link_text="${elementId}"]`);

        if (element) {
          await element.click(); // Focus the element
          // Select all and delete
          await this.page.keyboard.down("Control");
          await this.page.keyboard.press("a");
          await this.page.keyboard.up("Control");
          await this.page.keyboard.press("Delete");
          this.logger.success(`Cleared content from element ${elementId}`);
          return true;
        } else {
          this.logger.warning(`Element ${elementId} not found for clearing`);
          return false;
        }
      } else if (action === "ANALYZE" || action === "COMPLETE") {
        return true; // No action needed
      }

      return false;
    } catch (error) {
      this.logger.error(`Error performing action: ${error.message}`);
      return false;
    }
  }

  async analyzeWithClaude(imagePath, userPrompt = null) {
    try {
      const base64Image = this.encodeImageToBase64(imagePath);

      // Claude requires separate system parameter and different message format
      const messages = [...this.conversationHistory];

      const imageContent = {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: base64Image,
        },
      };

      if (userPrompt) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: userPrompt,
            },
            imageContent,
          ],
        });
      } else {
        messages.push({
          role: "user",
          content: [imageContent],
        });
      }

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        temperature: 0.1,
        system: this.systemMessage,
        messages: messages,
      });

      const aiResponse = response.content[0].text;

      // Update conversation history
      const userMessage = userPrompt
        ? {
            role: "user",
            content: userPrompt + `[Image provided]: ${imagePath}`,
          }
        : null;

      const assistantMessage = {
        role: "assistant",
        content: aiResponse,
      };

      // Update both histories
      if (userMessage) {
        this.conversationHistory.push(userMessage);
        this.fullConversationHistory.push(userMessage);
      }
      this.conversationHistory.push(assistantMessage);
      this.fullConversationHistory.push(assistantMessage);

      // Keep conversation history manageable for API calls (save tokens)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Log full conversation count
      this.logger.debug(
        `Conversation history: ${this.conversationHistory.length} messages (API), ${this.fullConversationHistory.length} messages (full log)`
      );

      return aiResponse;
    } catch (error) {
      throw new Error(`Claude analysis failed: ${error.message}`);
    }
  }

  async startInteractiveSession() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.logger.separator("AI Web Agent Started");
    this.logger.info("🤖 Enhanced with Autonomous Task Execution!");
    this.logger.info("CAPABILITIES:");
    this.logger.info(
      "📍 Simple commands: 'click pricing', 'scroll down', 'type hello'"
    );
    this.logger.info(
      "🧠 Complex tasks: Multi-step instructions executed automatically"
    );
    this.logger.info("EXAMPLE COMPLEX TASKS:");
    this.logger.info(
      "• 'Go to https://npmjs.com and find the Pricing page, then tell me the pricing for each category'"
    );
    this.logger.info(
      "• 'Search for react tutorial and then click on the first result'"
    );
    this.logger.info(
      "• 'Navigate to the contact page and fill out the contact form'"
    );
    this.logger.info(
      "• 'Find the documentation section and then locate the API reference'"
    );
    this.logger.info("COMMANDS:");
    this.logger.info("- Enter a URL to navigate");
    this.logger.info("- Give simple or complex instructions");
    this.logger.info('- Type "quit" to exit');
    this.logger.separator();

    const askQuestion = () => {
      rl.question("You: ", async (input) => {
        if (input.toLowerCase() === "quit") {
          this.logger.info("Goodbye!");
          await this.cleanup();
          rl.close();
          process.exit(0);
        }

        try {
          // Log user input
          this.logger.user(input);

          // Check if input is a URL
          if (input.startsWith("http://") || input.startsWith("https://")) {
            await this.page.goto(input, { waitUntil: "networkidle2" });
            this.logger.success(`Navigated to: ${input}`);
            await this.waitFor(2000);
          }

          // Highlight interactive elements
          const elements = await this.highlightLinks();
          this.logger.debug(
            `Highlighted ${elements.length} interactive elements`
          );

          // Take screenshot
          const screenshotPath = await this.takeScreenshot("init_page.jpg");

          // Detect if this is a complex task vs simple command
          const isComplexTask = this.isComplexTask(input);

          let aiResponse;
          if (isComplexTask) {
            // Handle complex multi-step task
            this.logger.task(
              "Detected complex task - creating execution plan..."
            );

            const planningPrompt = Prompts.getPlanningPrompt(input);

            this.logger.ai(
              `Analyzing initial page with the following prompt: \n${planningPrompt}`
            );
            aiResponse = await this.analyzeWithClaude(
              screenshotPath,
              planningPrompt
            );
            this.logger.ai(`AI Response: ${aiResponse}`);

            // Parse the plan
            const parsedPlan = this.parsePlan(aiResponse);
            if (parsedPlan) {
              this.currentTask = parsedPlan.task;
              this.taskSteps = parsedPlan.steps;
              this.currentStepIndex = 0;
              this.taskCompleted = false;

              this.logger.task(`Plan created for: ${this.currentTask}`);
              this.logger.info(`Steps identified: ${this.taskSteps.length}`);
              this.taskSteps.forEach((step, index) => {
                this.logger.info(`   ${index + 1}. ${step}`);
              });

              // Start autonomous execution
              await this.executeTaskAutonomously();
            } else {
              this.logger.error(
                "Could not parse the plan. Falling back to single action mode."
              );
              // Fall back to single action mode
              aiResponse = await this.analyzeWithClaude(screenshotPath, input);
              this.logger.ai(`AI Response: ${aiResponse}`);
              await this.handleSingleAction(aiResponse);
            }
          } else {
            // Handle simple single action
            this.logger.info("Handling as single action...");
            aiResponse = await this.analyzeWithClaude(screenshotPath, input);
            this.logger.ai(`AI Response: ${aiResponse}`);
            await this.handleSingleAction(aiResponse);
          }
        } catch (error) {
          this.logger.error(`Error: ${error.message}`);
        }

        askQuestion(); // Continue the conversation
      });
    };

    askQuestion();
  }

  // Detect if user input represents a complex multi-step task
  isComplexTask(input) {
    return true;
  }

  // Handle single actions (backward compatibility)
  async handleSingleAction(aiResponse) {
    // Check for ANALYZE action first (no colon needed)
    if (aiResponse.trim() === "ANALYZE" || aiResponse.includes("ANALYZE")) {
      this.logger.info(
        "Analysis action detected - current page already analyzed"
      );
      return;
    }

    // Parse both single actions and comma-separated actions
    let actions = [];

    // First, try to find individual actions (existing logic)
    const actionMatch = aiResponse.match(
      /(CLICK|TYPE|FETCH|SCROLL|SELECT|HOVER|PRESS|WAIT|CLEAR|COMPLETE):[^\n]*/
    );
    if (actionMatch) {
      actions.push(actionMatch[0]);
    }

    // Also check for comma-separated actions
    const commaSeparatedPattern =
      /(?:^|\n)\s*([A-Z]+:[^,\n]*(?:,[A-Z]+:[^,\n]*)*)\s*(?:\n|$)/g;
    const commaSeparatedMatches = [
      ...aiResponse.matchAll(commaSeparatedPattern),
    ];

    for (const match of commaSeparatedMatches) {
      const line = match[1].trim();
      if (line.includes(",")) {
        // Split by comma and clean up each action
        const commaSeparatedActions = line
          .split(",")
          .map((action) => action.trim());
        // Verify each action has the correct format
        const validActions = commaSeparatedActions.filter((action) =>
          /^(CLICK|TYPE|FETCH|SCROLL|SELECT|HOVER|PRESS|WAIT|CLEAR|COMPLETE):/.test(
            action
          )
        );
        if (validActions.length > 0) {
          actions.push(...validActions);
        }
      }
    }

    // Remove duplicates while preserving order
    actions = [...new Set(actions)];

    if (actions.length > 0) {
      this.logger.info(`Executing ${actions.length} action(s):`);
      actions.forEach((action, index) => {
        this.logger.info(`  ${index + 1}. ${action}`);
      });

      // Execute all actions sequentially
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        this.logger.info(
          `Executing action ${i + 1}/${actions.length}: ${action}`
        );

        const success = await this.performAction(action, this.page);
        if (success) {
          this.logger.success(
            `Action ${i + 1}/${actions.length} completed successfully`
          );
          // Take new screenshot after each action
          await this.waitFor(2000);
          await this.highlightLinks();
          await this.takeScreenshot();

          // Add a small delay between actions if there are more
          if (i < actions.length - 1) {
            await this.waitFor(1000);
          }
        } else {
          this.logger.error(
            `Action ${i + 1}/${actions.length} failed: ${action}`
          );
          break; // Stop executing remaining actions if one fails
        }
      }
    } else {
      this.logger.warning("No valid actions found in response");
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.logger.info("Browser closed");
    }
  }

  // Helper method for waiting that works across Puppeteer versions
  async waitFor(ms) {
    try {
      if (this.page.waitForTimeout) {
        await this.page.waitForTimeout(ms);
      } else if (this.page.waitFor) {
        await this.page.waitFor(ms);
      } else {
        // Fallback to promise-based timeout
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
    } catch (error) {
      this.logger.debug(`Wait method failed, using fallback: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  // Extract and parse task plan from AI response
  parsePlan(aiResponse) {
    const planMatch = aiResponse.match(/PLAN:\s*(.+?)(?:\n|$)/i);
    const stepsMatch = aiResponse.match(/STEPS:\s*([\s\S]*?)(?:\n\n|$)/i);

    if (planMatch && stepsMatch) {
      const taskDescription = planMatch[1].trim();
      const stepsText = stepsMatch[1];
      const steps = stepsText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+\./.test(line))
        .map((line) => line.replace(/^\d+\.\s*/, ""));

      return {
        task: taskDescription,
        steps: steps,
      };
    }
    return null;
  }

  // Execute a single step in the current task
  async executeTaskStep() {
    if (!this.currentTask || this.currentStepIndex >= this.taskSteps.length) {
      return false;
    }

    const currentStep = this.taskSteps[this.currentStepIndex];
    this.logger.step(
      `Executing Step ${this.currentStepIndex + 1}/${
        this.taskSteps.length
      }: ${currentStep}`
    );

    // Take screenshot and analyze for this step
    await this.highlightLinks();
    const screenshotPath = await this.takeScreenshot();

    // Ask AI to execute this specific step
    const stepPrompt = Prompts.getStepPrompt(
      this.currentTask,
      this.currentStepIndex,
      this.taskSteps.length,
      currentStep
    );

    this.logger.ai(
      `Step ${this.currentStepIndex + 1}/${
        this.taskSteps.length
      }, Analyzing the page for the current step with the following prompt: \n${stepPrompt}`
    );
    const aiResponse = await this.analyzeWithClaude(screenshotPath, stepPrompt);
    this.logger.ai(`AI Response: ${aiResponse}`);

    // Save both JSON and readable format using FULL conversation history for logging
    const fullConversationData = [
      {
        role: "system",
        content: this.systemMessage,
      },
      ...this.fullConversationHistory,
    ];

    // Save JSON format (complete conversation history)
    this.logger.dumpFile(
      JSON.stringify(fullConversationData, null, 2),
      `full-conversation.json`
    );

    // Save human-readable format (complete conversation history)
    const readableContent = fullConversationData
      .map((msg, index) => {
        return `=== Message ${index + 1} (${msg.role.toUpperCase()}) ===\n${
          msg.content
        }\n`;
      })
      .join("\n");

    this.logger.dumpFile(readableContent, `full-conversation-readable.txt`);

    // Also save current API prompt for debugging (truncated version)
    const currentApiData = [
      {
        role: "system",
        content: this.systemMessage,
      },
      ...this.conversationHistory,
    ];

    this.logger.dumpFile(
      JSON.stringify(currentApiData, null, 2),
      `current-api-prompt.json`
    );

    // Check for actions - find ALL actions, including multi-line responses and comma-separated actions
    let allActions = [];

    // First, find all actions using the existing regex pattern (line-by-line)
    const allActionMatches = [
      ...aiResponse.matchAll(
        /(CLICK|TYPE|FETCH|SCROLL|SELECT|HOVER|PRESS|WAIT|CLEAR|COMPLETE):[^\n\r]*/g
      ),
    ];

    // Add line-by-line actions
    allActions.push(...allActionMatches.map((match) => match[0]));

    // Also check for comma-separated actions on a single line
    const commaSeparatedPattern =
      /(?:^|\n)\s*([A-Z]+:[^,\n]*(?:,[A-Z]+:[^,\n]*)*)\s*(?:\n|$)/g;
    const commaSeparatedMatches = [
      ...aiResponse.matchAll(commaSeparatedPattern),
    ];

    for (const match of commaSeparatedMatches) {
      const line = match[1].trim();
      if (line.includes(",")) {
        // Split by comma and clean up each action
        const commaSeparatedActions = line
          .split(",")
          .map((action) => action.trim());
        // Verify each action has the correct format
        const validActions = commaSeparatedActions.filter((action) =>
          /^(CLICK|TYPE|FETCH|SCROLL|SELECT|HOVER|PRESS|WAIT|CLEAR|COMPLETE):/.test(
            action
          )
        );
        if (validActions.length > 0) {
          allActions.push(...validActions);
        }
      }
    }

    // Remove duplicates while preserving order
    allActions = [...new Set(allActions)];

    // Also check for ANALYZE actions (can appear on their own line)
    const analyzeMatches = aiResponse.match(/^ANALYZE$/gm);
    if (analyzeMatches) {
      allActions.push(...analyzeMatches);
    }

    // Special handling for standalone ANALYZE action
    if (
      aiResponse.trim() === "ANALYZE" ||
      (analyzeMatches && analyzeMatches.length > 0)
    ) {
      this.logger.info("Analysis action detected - analyzing current page");

      // For analysis steps, we consider them completed immediately since they just extract info
      this.logger.success("Analysis completed");
      this.currentStepIndex++;

      // Check if we've completed all steps
      if (this.currentStepIndex >= this.taskSteps.length) {
        this.logger.success(
          "All planned steps completed! Generating final analysis..."
        );

        // Take final screenshot and provide results
        await this.highlightLinks();
        const finalScreenshot = await this.takeScreenshot();
        const finalPrompt = Prompts.getFinalPrompt(this.currentTask);

        this.logger.ai(
          `Analyzing the page for the final step with the following prompt: \n${finalPrompt}`
        );
        const finalResponse = await this.analyzeWithClaude(
          finalScreenshot,
          finalPrompt
        );
        this.logger.success(`FINAL RESULTS:\n${finalResponse}`);

        this.taskCompleted = true;
        return false; // Stop execution
      }

      return true; // Continue to next step
    }

    // Check for explicit breakdown request
    if (aiResponse.includes("BREAKDOWN_NEEDED")) {
      this.logger.info("AI explicitly requested step breakdown");
      return await this.handleStepBreakdown(currentStep, screenshotPath);
    }

    if (aiResponse === "NULL") {
      this.logger.warning("No action required to take for this step!");
      // Move to next step
      this.currentStepIndex++;
      return true;
    }

    if (allActions.length > 0) {
      this.logger.info(
        `Executing ${allActions.length} action(s) for this step:`
      );
      allActions.forEach((action, index) => {
        this.logger.info(`  ${index + 1}. ${action}`);
      });

      // Execute all actions sequentially
      let allActionsSuccessful = true;
      for (let i = 0; i < allActions.length; i++) {
        const action = allActions[i];
        this.logger.info(`⚡ Action ${i + 1}/${allActions.length}: ${action}`);

        if (action === "COMPLETE") {
          this.taskCompleted = true;
          this.logger.success("Task completed successfully!");
          return false; // Stop execution
        }

        const success = await this.performAction(action, this.page);
        if (success) {
          this.logger.success(
            `✅ Action ${i + 1}/${allActions.length} completed`
          );
          // Add a small delay between actions
          if (i < allActions.length - 1) {
            await this.waitFor(1000);
          }
        } else {
          this.logger.error(
            `❌ Action ${i + 1}/${allActions.length} failed: ${action}`
          );
          allActionsSuccessful = false;
          break; // Stop executing remaining actions if one fails
        }
      }

      if (allActionsSuccessful) {
        this.logger.success(
          `🎉 All ${allActions.length} action(s) completed successfully for this step`
        );
        await this.waitFor(2000);

        // Optional: Verify step completion before moving to next step
        const verificationEnabled = process.env.ENABLE_VERIFICATION === "true";
        let stepCompleted = true; // Default to true when verification is disabled

        if (verificationEnabled) {
          stepCompleted = await this.verifyStepCompletion(currentStep);

          if (stepCompleted) {
            this.logger.success(`Step verification passed: ${currentStep}`);
          } else {
            this.logger.warning(`Step verification failed: ${currentStep}`);
            this.logger.info("Step needs further breakdown...");
            return await this.handleStepBreakdown(currentStep, screenshotPath);
          }
        } else {
          this.logger.debug(
            "Step verification disabled - proceeding to next step"
          );
        }

        if (stepCompleted) {
          this.currentStepIndex++;

          // Check if we've completed all steps
          if (this.currentStepIndex >= this.taskSteps.length) {
            this.logger.success(
              "All planned steps completed! Generating final analysis..."
            );

            // Take final screenshot and provide results
            await this.highlightLinks();
            const finalScreenshot = await this.takeScreenshot();
            const finalPrompt = Prompts.getFinalPrompt(this.currentTask);

            this.logger.ai(
              `Analyzing the page for the final step with the following prompt: \n${finalPrompt}`
            );
            const finalResponse = await this.analyzeWithClaude(
              finalScreenshot,
              finalPrompt
            );
            this.logger.success(`FINAL RESULTS:\n${finalResponse}`);

            this.taskCompleted = true;
            return false; // Stop execution
          }

          return true; // Continue to next step
        }
      } else {
        this.logger.error("Some actions failed, retrying step...");
        return true; // Retry current step
      }
    } else {
      // No direct actions found - this might be a complex step that needs breakdown
      this.logger.warning("No DOM action found in AI response for this step!");
      return await this.handleStepBreakdown(currentStep, screenshotPath);
    }
  }

  // Start autonomous task execution
  async executeTaskAutonomously() {
    this.logger.task(
      `Starting autonomous execution of task: ${this.currentTask}`
    );
    this.logger.info(`Steps to execute: ${this.taskSteps.length}`);

    let continueExecution = true;
    let maxSteps = 20; // Safety limit
    let stepCount = 0;

    while (continueExecution && !this.taskCompleted && stepCount < maxSteps) {
      stepCount++;
      continueExecution = await this.executeTaskStep();

      if (continueExecution) {
        await this.waitFor(1000); // Brief pause between steps
      }
    }

    if (stepCount >= maxSteps) {
      this.logger.warning(
        "Reached maximum step limit. Task execution stopped."
      );
    }

    // Reset task state
    this.currentTask = null;
    this.taskSteps = [];
    this.currentStepIndex = 0;
    this.taskCompleted = false;
  }

  // Verify step completion
  async verifyStepCompletion(step) {
    this.logger.info(`Verifying completion of step: ${step}`);

    // Take a fresh screenshot to verify current state with specific filename
    await this.highlightLinks();
    const verificationScreenshot = await this.takeScreenshot(
      `${this.currentStepIndex}_verification.jpg`
    );

    const verificationPrompt = Prompts.getVerificationPrompt(step);

    this.logger.ai(
      `Verifying step completion with prompt: \n${verificationPrompt}`
    );
    const verificationResponse = await this.analyzeWithClaude(
      verificationScreenshot,
      verificationPrompt
    );
    this.logger.ai(`Verification response: ${verificationResponse}`);

    const isCompleted = verificationResponse.includes("COMPLETED");
    this.logger.info(
      `Step completion verification: ${isCompleted ? "PASSED" : "FAILED"}`
    );

    return isCompleted;
  }

  // Handle step breakdown
  async handleStepBreakdown(currentStep, screenshotPath) {
    this.logger.info(
      "Step appears to be complex and needs further breakdown..."
    );

    // Ask AI to create a sub-plan for this specific step
    const subPlanPrompt = Prompts.getSubPlanPrompt(currentStep);

    this.logger.ai(
      `Creating sub-plan for complex step with prompt: \n${subPlanPrompt}`
    );
    const subPlanResponse = await this.analyzeWithClaude(
      screenshotPath,
      subPlanPrompt
    );
    this.logger.ai(`Sub-plan response: ${subPlanResponse}`);

    // Parse the sub-plan
    const parsedSubPlan = this.parseSubPlan(subPlanResponse);

    if (parsedSubPlan && parsedSubPlan.steps.length > 0) {
      this.logger.success(
        `Created sub-plan with ${parsedSubPlan.steps.length} sub-steps:`
      );
      parsedSubPlan.steps.forEach((subStep, index) => {
        this.logger.info(`   ${index + 1}. ${subStep}`);
      });

      // Execute sub-steps sequentially
      const subTaskSuccess = await this.executeSubSteps(
        parsedSubPlan.steps,
        currentStep
      );

      if (subTaskSuccess) {
        // Optional: Verify the overall step completion after sub-steps
        const verificationEnabled = process.env.ENABLE_VERIFICATION === "true";
        let stepCompleted = true; // Default to true when verification is disabled

        if (verificationEnabled) {
          stepCompleted = await this.verifyStepCompletion(currentStep);

          if (stepCompleted) {
            this.logger.success(
              `Complex step completed successfully: ${currentStep}`
            );
            this.currentStepIndex++;
            return true;
          } else {
            this.logger.error(
              `Complex step verification failed: ${currentStep}`
            );
            return true; // Retry the main step
          }
        } else {
          this.logger.debug(
            "Sub-step verification disabled - proceeding to next step"
          );
          this.logger.success(
            `Complex step completed successfully: ${currentStep}`
          );
          this.currentStepIndex++;
          return true;
        }
      } else {
        this.logger.error(`Complex step failed: ${currentStep}`);
        return true; // Retry the main step
      }
    } else {
      this.logger.error(
        "Could not create valid sub-plan. Moving to next step."
      );
      this.currentStepIndex++;
      return true;
    }
  }

  // Extract and parse sub-plan from AI response
  parseSubPlan(aiResponse) {
    const subPlanMatch = aiResponse.match(/SUB-PLAN:\s*(.+?)(?:\n|$)/i);
    const subStepsMatch = aiResponse.match(
      /SUB-STEPS:\s*([\s\S]*?)(?:\n\n|$)/i
    );

    if (subPlanMatch && subStepsMatch) {
      const taskDescription = subPlanMatch[1].trim();
      const stepsText = subStepsMatch[1];
      const steps = stepsText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+\./.test(line))
        .map((line) => line.replace(/^\d+\.\s*/, ""));

      return {
        task: taskDescription,
        steps: steps,
      };
    }
    return null;
  }

  // Execute sub-steps for a complex step
  async executeSubSteps(subSteps, parentStep) {
    this.logger.info(
      `Executing ${subSteps.length} sub-steps for: ${parentStep}`
    );

    const parentStepIndex = this.currentStepIndex; // Store parent step index

    for (let i = 0; i < subSteps.length; i++) {
      const subStep = subSteps[i];
      this.logger.step(`Sub-step ${i + 1}/${subSteps.length}: ${subStep}`);

      // Take screenshot and analyze for this sub-step with subtask context
      await this.highlightLinks();
      const screenshotPath = await this.takeScreenshot(
        null, // no custom filename
        true, // isSubTask = true
        i + 1, // subTaskIndex (1-based)
        parentStepIndex // parentStepIndex
      );

      // Ask AI to execute this specific sub-step
      const subStepPrompt = Prompts.getSubStepPrompt(
        i + 1,
        subSteps.length,
        subStep,
        parentStep
      );

      this.logger.ai(`Analyzing sub-step with prompt: \n${subStepPrompt}`);
      const subStepResponse = await this.analyzeWithClaude(
        screenshotPath,
        subStepPrompt
      );
      this.logger.ai(`Sub-step response: ${subStepResponse}`);

      // Parse and execute the sub-step action(s)
      if (
        subStepResponse.trim() === "ANALYZE" ||
        subStepResponse.includes("ANALYZE")
      ) {
        this.logger.info("Analysis sub-step detected - analyzing current page");
        this.logger.success(
          `Sub-step ${i + 1}/${subSteps.length} completed (analysis)`
        );
        await this.waitFor(1000);
        continue; // Move to next sub-step
      }

      // Check for multiple actions in sub-step response
      const subActionMatches = [
        ...subStepResponse.matchAll(
          /(CLICK|TYPE|FETCH|SCROLL|SELECT|HOVER|PRESS|WAIT|CLEAR):[^\n\r]*/g
        ),
      ];

      if (subActionMatches.length > 0) {
        const subActions = subActionMatches.map((match) => match[0]);

        this.logger.info(
          `Sub-step ${i + 1}/${subSteps.length} executing ${
            subActions.length
          } action(s):`
        );
        subActions.forEach((action, index) => {
          this.logger.info(`    ${index + 1}. ${action}`);
        });

        // Execute all sub-actions sequentially
        let allSubActionsSuccessful = true;
        for (let j = 0; j < subActions.length; j++) {
          const action = subActions[j];

          const success = await this.performAction(action, this.page);
          if (success) {
            this.logger.success(
              `✅ Sub-action ${j + 1}/${subActions.length} completed`
            );
            // Add a small delay between sub-actions
            if (j < subActions.length - 1) {
              await this.waitFor(500);
            }
          } else {
            this.logger.error(
              `❌ Sub-action ${j + 1}/${subActions.length} failed: ${action}`
            );
            allSubActionsSuccessful = false;
            break;
          }
        }

        if (allSubActionsSuccessful) {
          this.logger.success(
            `Sub-step ${i + 1}/${subSteps.length} completed successfully`
          );
          await this.waitFor(1000); // Brief delay between sub-steps
        } else {
          this.logger.error(`Sub-step ${i + 1}/${subSteps.length} failed`);
          return false; // Sub-task failed
        }
      } else {
        this.logger.warning(
          `No action found for sub-step ${i + 1}/${
            subSteps.length
          }, skipping...`
        );
      }
    }

    return true; // All sub-steps completed successfully
  }
}

// Main execution
async function main() {
  const agent = new WebAgent();

  try {
    await agent.initialize();
    await agent.startInteractiveSession();
  } catch (error) {
    if (agent.logger) {
      agent.logger.error("Error starting web agent", error.message);
    } else {
      console.error("Error starting web agent:", error.message);
    }
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
