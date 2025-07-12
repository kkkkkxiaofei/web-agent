import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Handle tool execution for web automation tools
 * @param {string} name - The name of the tool to execute
 * @param {object} args - The arguments for the tool
 * @param {object} automation - The automation instance
 * @returns {Promise<object>} - The result of the tool execution
 */
async function handleToolExecution(name, args, automation) {
  switch (name) {
    case "web_navigate":
      const result = await performAction(automation, `FETCH:${args.url}`);

      // Get page hierarchy summary
      const navHierarchy =
        await automation.pageHierarchy.safelyGetPageHierarchy();

      return {
        content: [
          {
            type: "text",
            text: `${result.message}\n\n${navHierarchy}`,
          },
        ],
      };

    case "web_click":
      const clickResult = await performAction(
        automation,
        `CLICK:${args.element_id}`
      );
      const clickHierarchy =
        await automation.pageHierarchy.safelyGetPageHierarchy();
      return {
        content: [
          {
            type: "text",
            text: `${clickResult.message}\n\n${clickHierarchy}`,
          },
        ],
      };

    case "web_type":
      const typeResult = await performAction(
        automation,
        `TYPE:${args.element_id}:${args.text}`
      );
      const typeHierarchy =
        await automation.pageHierarchy.safelyGetPageHierarchy();
      return {
        content: [
          {
            type: "text",
            text: `${typeResult.message}\n\n${typeHierarchy}`,
          },
        ],
      };

    case "web_scroll":
      const scrollAction = args.amount
        ? `SCROLL:${args.direction}:${args.amount}`
        : `SCROLL:${args.direction}`;
      const scrollResult = await performAction(automation, scrollAction);
      const scrollHierarchy =
        await automation.pageHierarchy.safelyGetPageHierarchy();
      return {
        content: [
          {
            type: "text",
            text: `${scrollResult.message}\n\n${scrollHierarchy}`,
          },
        ],
      };

    case "web_select":
      const selectResult = await performAction(
        automation,
        `SELECT:${args.element_id}:${args.option}`
      );
      const selectHierarchy =
        await automation.pageHierarchy.safelyGetPageHierarchy();
      return {
        content: [
          {
            type: "text",
            text: `${selectResult.message}\n\n${selectHierarchy}`,
          },
        ],
      };

    case "web_hover":
      const hoverResult = await performAction(
        automation,
        `HOVER:${args.element_id}`
      );
      const hoverHierarchy =
        await automation.pageHierarchy.safelyGetPageHierarchy();
      return {
        content: [
          {
            type: "text",
            text: `${hoverResult.message}\n\n${hoverHierarchy}`,
          },
        ],
      };

    case "web_press_key":
      const pressResult = await performAction(automation, `PRESS:${args.keys}`);
      const pressHierarchy =
        await automation.pageHierarchy.safelyGetPageHierarchy();
      return {
        content: [
          {
            type: "text",
            text: `${pressResult.message}\n\n${pressHierarchy}`,
          },
        ],
      };

    case "web_wait":
      const waitResult = await performAction(
        automation,
        `WAIT:${args.seconds}`
      );
      return {
        content: [
          {
            type: "text",
            text: waitResult.message,
          },
        ],
      };

    case "web_clear":
      const clearResult = await performAction(
        automation,
        `CLEAR:${args.element_id}`
      );
      const clearHierarchy =
        await automation.pageHierarchy.safelyGetPageHierarchy();
      return {
        content: [
          {
            type: "text",
            text: `${clearResult.message}\n\n${clearHierarchy}`,
          },
        ],
      };

    case "web_screenshot":
      const filename = args.filename || "screenshot.jpg";
      const screenshotResult = await automation.takeScreenshot(filename, true); // Request base64
      return {
        content: [
          {
            type: "text",
            text: `Screenshot captured (${screenshotResult.size} bytes)`,
          },
          {
            type: "image",
            data: screenshotResult.base64,
            mimeType: screenshotResult.mimeType,
          },
        ],
      };

    case "web_analyze":
      const analyzeResult = await performAction(
        automation,
        `ANALYZE:${args.prompt}`
      );
      return {
        content: [
          {
            type: "text",
            text: `Analysis: ${analyzeResult.analysis}`,
          },
        ],
      };

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
}

/**
 * Perform web automation actions using PuppeteerManager
 * @param {object} automation - The automation instance containing puppeteerManager, logger, etc.
 * @param {string} action - The action to perform
 * @returns {Promise<object>} - The result of the action
 */
async function performAction(automation, action) {
  try {
    await automation.initialize();
  } catch (error) {
    throw new Error(`Failed to initialize browser: ${error.message}`);
  }

  automation.logger.info(`Performing action: ${action}`);

  try {
    if (action.startsWith("CLICK:")) {
      const elementId = action.replace("CLICK:", "").trim();
      const selector = automation.elementMap.get(elementId);

      if (!selector) {
        throw new Error(
          `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
        );
      }

      // Store current URL to detect navigation
      const currentUrl = automation.puppeteerManager.getCurrentUrl();

      try {
        const result = await automation.puppeteerManager.clickElement(selector);
        automation.logger.success(
          `Clicked element ${elementId} using selector: ${selector}`
        );

        // Check if URL changed (indicating navigation)
        const newUrl = automation.puppeteerManager.getCurrentUrl();
        if (currentUrl !== newUrl) {
          automation.logger.info(
            `Page navigated from ${currentUrl} to ${newUrl}`
          );
          // Clear element map since page changed
          automation.elementMap.clear();
          // Clear window object data as well
          await automation.pageHierarchy.clearWindowObjectData();
        }

        return { success: true, message: `Clicked element ${elementId}` };
      } catch (error) {
        throw new Error(
          `Element ${elementId} not found on page with selector: ${selector}. The element may have been removed or modified since the last page hierarchy generation.`
        );
      }
    } else if (action.startsWith("TYPE:")) {
      const parts = action.replace("TYPE:", "").split(":");
      const elementId = parts[0].trim();
      const text = parts.slice(1).join(":").trim();
      const selector = automation.elementMap.get(elementId);

      if (!selector) {
        throw new Error(
          `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
        );
      }

      // Store current URL to detect navigation
      const currentUrl = automation.puppeteerManager.getCurrentUrl();

      try {
        const result = await automation.puppeteerManager.typeIntoElement(
          selector,
          text
        );
        automation.logger.success(
          `Typed "${text}" into element ${elementId} using selector: ${selector}`
        );

        // Check if URL changed (indicating navigation)
        const newUrl = automation.puppeteerManager.getCurrentUrl();
        if (currentUrl !== newUrl) {
          automation.logger.info(
            `Page navigated from ${currentUrl} to ${newUrl}`
          );
          // Clear element map since page changed
          automation.elementMap.clear();
          // Clear window object data as well
          await automation.pageHierarchy.clearWindowObjectData();
        }

        return {
          success: true,
          message: `Typed "${text}" into element ${elementId}`,
        };
      } catch (error) {
        throw new Error(
          `Input element ${elementId} not found on page with selector: ${selector}. The element may have been removed or modified since the last page hierarchy generation.`
        );
      }
    } else if (action.startsWith("FETCH:")) {
      const url = action.replace("FETCH:", "").trim();
      const result = await automation.puppeteerManager.navigateToUrl(url);
      automation.logger.success(`Navigated to: ${url}`);
      await automation.waitFor(2000);

      return {
        success: true,
        message: `Navigated to: ${url}`,
        pageInfo: {
          title: result.title,
          url: result.url,
        },
      };
    } else if (action.startsWith("SCROLL:")) {
      const parts = action.replace("SCROLL:", "").split(":");
      const direction = parts[0].trim().toLowerCase();
      const customAmount = parts[1] ? parseInt(parts[1].trim()) : 500;

      const result = await automation.puppeteerManager.scrollPage(
        direction,
        customAmount
      );
      automation.logger.success(result.message);
      await automation.waitFor(1000);
      return result;
    } else if (action.startsWith("SELECT:")) {
      const parts = action.replace("SELECT:", "").split(":");
      const elementId = parts[0].trim();
      const optionText = parts.slice(1).join(":").trim();
      const selector = automation.elementMap.get(elementId);

      if (!selector) {
        throw new Error(
          `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
        );
      }

      // Store current URL to detect navigation
      const currentUrl = automation.puppeteerManager.getCurrentUrl();

      try {
        const result = await automation.puppeteerManager.selectOption(
          selector,
          optionText
        );
        automation.logger.success(result.message);

        // Check if URL changed (indicating navigation)
        const newUrl = automation.puppeteerManager.getCurrentUrl();
        if (currentUrl !== newUrl) {
          automation.logger.info(
            `Page navigated from ${currentUrl} to ${newUrl}`
          );
          // Clear element map since page changed
          automation.elementMap.clear();
          // Clear window object data as well
          await automation.pageHierarchy.clearWindowObjectData();
        }

        return {
          success: true,
          message: `Selected "${optionText}" from dropdown ${elementId}`,
        };
      } catch (error) {
        throw new Error(`Dropdown element ${elementId} not found on page`);
      }
    } else if (action.startsWith("HOVER:")) {
      const elementId = action.replace("HOVER:", "").trim();
      const selector = automation.elementMap.get(elementId);

      if (!selector) {
        throw new Error(
          `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
        );
      }

      // Store current URL to detect navigation
      const currentUrl = automation.puppeteerManager.getCurrentUrl();

      try {
        const result = await automation.puppeteerManager.hoverElement(selector);
        automation.logger.success(`Hovered over element ${elementId}`);

        // Check if URL changed (indicating navigation)
        const newUrl = automation.puppeteerManager.getCurrentUrl();
        if (currentUrl !== newUrl) {
          automation.logger.info(
            `Page navigated from ${currentUrl} to ${newUrl}`
          );
          // Clear element map since page changed
          automation.elementMap.clear();
          // Clear window object data as well
          await automation.pageHierarchy.clearWindowObjectData();
        }

        return {
          success: true,
          message: `Hovered over element ${elementId}`,
        };
      } catch (error) {
        throw new Error(`Element ${elementId} not found on page for hover`);
      }
    } else if (action.startsWith("PRESS:")) {
      const keySequence = action.replace("PRESS:", "").trim();

      const result = await automation.puppeteerManager.pressKeys(keySequence);
      automation.logger.success(result.message);
      return result;
    } else if (action.startsWith("WAIT:")) {
      const seconds = parseFloat(action.replace("WAIT:", "").trim());

      if (isNaN(seconds) || seconds <= 0) {
        throw new Error(`Invalid wait time: ${seconds}`);
      }

      automation.logger.info(`Waiting ${seconds} seconds...`);
      await automation.waitFor(seconds * 1000);
      automation.logger.success(`Waited ${seconds} seconds`);
      return { success: true, message: `Waited ${seconds} seconds` };
    } else if (action.startsWith("CLEAR:")) {
      const elementId = action.replace("CLEAR:", "").trim();
      const selector = automation.elementMap.get(elementId);

      if (!selector) {
        throw new Error(
          `Element reference ${elementId} not found. Please run web_navigate first to generate element references.`
        );
      }

      // Store current URL to detect navigation
      const currentUrl = automation.puppeteerManager.getCurrentUrl();

      try {
        const result = await automation.puppeteerManager.clearElement(selector);
        automation.logger.success(`Cleared content from element ${elementId}`);

        // Check if URL changed (indicating navigation)
        const newUrl = automation.puppeteerManager.getCurrentUrl();
        if (currentUrl !== newUrl) {
          automation.logger.info(
            `Page navigated from ${currentUrl} to ${newUrl}`
          );
          // Clear element map since page changed
          automation.elementMap.clear();
          // Clear window object data as well
          await automation.pageHierarchy.clearWindowObjectData();
        }

        return {
          success: true,
          message: `Cleared content from element ${elementId}`,
        };
      } catch (error) {
        throw new Error(`Element ${elementId} not found on page for clearing`);
      }
    } else if (action.startsWith("ANALYZE")) {
      // Check if Anthropic API key is configured
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          "Anthropic API key not found. Please set ANTHROPIC_API_KEY in your .env file. You can get an API key from https://console.anthropic.com/"
        );
      }

      const analysisPrompt = action.replace("ANALYZE:", "").trim();
      const screenshotPath = await automation.takeScreenshot(
        `analyze-${Date.now()}.jpg`,
        false // Save to file for analysis
      );

      try {
        const analysisResponse =
          await automation.anthropicClient.analyzeWithClaude(
            screenshotPath,
            analysisPrompt,
            automation.systemMessage
          );

        automation.logger.success(`Analyzed with prompt: ${analysisPrompt}`);
        return {
          success: true,
          message: `Analysis completed`,
          analysis: analysisResponse,
          screenshot: screenshotPath,
        };
      } catch (error) {
        if (
          error.message.includes("apiKey") ||
          error.message.includes("authentication")
        ) {
          throw new Error(
            "Failed to authenticate with Claude. Please check your ANTHROPIC_API_KEY in .env file is correct and valid."
          );
        }
        throw error;
      }
    } else {
      throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    automation.logger.error(`Action failed: ${error.message}`);
    throw error;
  }
}

export { handleToolExecution, performAction };
