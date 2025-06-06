const puppeteer = require("puppeteer");
const fs = require("fs");
const readline = require("readline");
const { OpenAI } = require("./custom_openai_client");
const Logger = require("./logger");
require("dotenv").config();

class WebAgent {
  constructor() {
    this.browser = null;
    this.page = null;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.conversationHistory = [];
    this.currentTask = null;
    this.taskSteps = [];
    this.currentStepIndex = 0;
    this.taskCompleted = false;

    // Initialize logger
    this.logger = new Logger({
      logFile: "web_agent.log",
      showInTerminal: true,
    });

    this.systemMessage = `You are an AI web browsing agent capable of planning and executing complex multi-step tasks autonomously.

CAPABILITIES:
1. CLICK:[element_id] - Click on an element with the specified gbt_link_text attribute
2. TYPE:[element_id]:[text] - Type text into an input field  
3. FETCH:[url] - Navigate to a new URL
4. SCROLL:[direction] - Scroll up or down (direction: up/down)
5. ANALYZE - Analyze the current page without taking action
6. COMPLETE - Mark the current task as finished
7. PLAN:[task_description] - Create a step-by-step plan for a complex task

TASK EXECUTION MODES:
- SINGLE MODE: Execute one action based on user request
- AUTONOMOUS MODE: When given a complex task, create a plan and execute steps automatically

INSTRUCTIONS:
- When you see highlighted elements, they have yellow borders and numbers. Use these numbers as element_ids.
- For complex tasks (multiple steps), use PLAN: to break them down, then execute each step.
- Always explain what you see and what action you're taking.
- After each action, assess if you've completed the current step and what to do next.
- Use COMPLETE when the overall task is finished.

PLANNING FORMAT:
When creating a plan, use this format:
PLAN: [Brief task description]
STEPS:
1. [First step]
2. [Second step] 
3. [Third step]
...

Then execute each step automatically.`;
  }

  async initialize() {
    this.logger.info("Initializing web agent...");

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

  async takeScreenshot(filename = "current_page.jpg") {
    try {
      await this.page.screenshot({
        path: filename,
        fullPage: false,
        quality: 90,
      });
      this.logger.debug(`Screenshot saved as ${filename}`);
      return filename;
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
      } else if (action === "ANALYZE" || action === "COMPLETE") {
        return true; // No action needed
      }

      return false;
    } catch (error) {
      this.logger.error(`Error performing action: ${error.message}`);
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
        model: "gpt-4o",
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
          const screenshotPath = await this.takeScreenshot();

          // Detect if this is a complex task vs simple command
          const isComplexTask = this.isComplexTask(input);

          let aiResponse;
          if (isComplexTask) {
            // Handle complex multi-step task
            this.logger.task(
              "Detected complex task - creating execution plan..."
            );

            const planningPrompt = `Complex task request: "${input}"

This appears to be a multi-step task. Please create a detailed plan to accomplish this task autonomously. Use the PLAN format:

PLAN: [Brief description]
STEPS:
1. [First step]
2. [Second step]
3. [Third step]
...

Then I will execute each step automatically.`;

            this.logger.ai(
              `Analyzing initial page with the following prompt: \n${planningPrompt}`
            );
            aiResponse = await this.analyzeWithGPT4V(
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
              aiResponse = await this.analyzeWithGPT4V(screenshotPath, input);
              this.logger.ai(`AI Response: ${aiResponse}`);
              await this.handleSingleAction(aiResponse);
            }
          } else {
            // Handle simple single action
            this.logger.info("Handling as single action...");
            aiResponse = await this.analyzeWithGPT4V(screenshotPath, input);
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
    const complexIndicators = [
      /then|after|next|finally|and then/i,
      /go to .+ and .+/i,
      /find .+ and .+/i,
      /search .+ and .+/i,
      /click .+ then .+/i,
      /navigate .+ and .+/i,
      /complete .+ task/i,
      /step by step/i,
      /multiple steps/i,
    ];

    return complexIndicators.some((pattern) => pattern.test(input));
  }

  // Handle single actions (backward compatibility)
  async handleSingleAction(aiResponse) {
    const actionMatch = aiResponse.match(
      /(CLICK|TYPE|FETCH|SCROLL|COMPLETE):[^\n]*/
    );
    if (actionMatch) {
      const action = actionMatch[0];
      this.logger.info(`Executing action: ${action}`);

      const success = await this.performAction(action, this.page);
      if (success) {
        this.logger.success("Action completed successfully");
        // Take new screenshot after action
        await this.waitFor(2000);
        await this.highlightLinks();
        await this.takeScreenshot();
      } else {
        this.logger.error("Action failed");
      }
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
    const stepPrompt = `Current task: ${this.currentTask}
Current step (${this.currentStepIndex + 1}/${
      this.taskSteps.length
    }): ${currentStep}

Please analyze the current page and take the appropriate action to complete this step. If this step is completed, you can move to the next step or use COMPLETE if all steps are done.`;

    this.logger.ai(
      `Step ${this.currentStepIndex + 1}/${
        this.taskSteps.length
      }, Analyzing the page for the current step with the following prompt: \n${stepPrompt}`
    );
    const aiResponse = await this.analyzeWithGPT4V(screenshotPath, stepPrompt);
    this.logger.ai(`AI Response: ${aiResponse}`);

    // Check for actions
    const actionMatch = aiResponse.match(
      /(CLICK|TYPE|FETCH|SCROLL|COMPLETE):[^\n]*/
    );
    if (actionMatch) {
      const action = actionMatch[0];
      this.logger.info(`Executing action: ${action}`);

      if (action === "COMPLETE") {
        this.taskCompleted = true;
        this.logger.success("Task completed successfully!");
        return false; // Stop execution
      }

      const success = await this.performAction(action, this.page);
      if (success) {
        this.logger.success("Step action completed successfully");
        await this.waitFor(2000);

        // Move to next step
        this.currentStepIndex++;

        // Check if we've completed all steps
        if (this.currentStepIndex >= this.taskSteps.length) {
          this.logger.success(
            "All planned steps completed! Generating final analysis..."
          );

          // Take final screenshot and provide results
          await this.highlightLinks();
          const finalScreenshot = await this.takeScreenshot();
          const finalPrompt = `Task completed: ${this.currentTask}

All steps have been executed. Please provide a summary of what was accomplished and any final results or information gathered.`;

          this.logger.ai(
            `Analyzing the page for the final step with the following prompt: \n${finalPrompt}`
          );
          const finalResponse = await this.analyzeWithGPT4V(
            finalScreenshot,
            finalPrompt
          );
          this.logger.success(`FINAL RESULTS:\n${finalResponse}`);

          this.taskCompleted = true;
          return false; // Stop execution
        }

        return true; // Continue to next step
      } else {
        this.logger.error("Step action failed, retrying...");
        return true; // Retry current step
      }
    } else {
      // No valid action found in AI response
      this.logger.error(
        `No valid action found in AI response for step ${
          this.currentStepIndex + 1
        }: ${aiResponse}`
      );
      this.logger.error("Task execution stopped due to invalid AI response");

      // Reset task state and stop execution
      this.currentTask = null;
      this.taskSteps = [];
      this.currentStepIndex = 0;
      this.taskCompleted = false;

      throw new Error(
        `Invalid AI response - no actionable command found in step ${
          this.currentStepIndex + 1
        }`
      );
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
