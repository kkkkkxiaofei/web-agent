const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
require("dotenv").config();

class AnthropicClient {
  constructor(logger) {
    const modelName = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.logger = logger;
    this.modelName = modelName;
    this.conversationHistory = [];
    this.fullConversationHistory = [];
    this.rawMessagesPosted = [];

    // Token usage tracking
    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      stepUsage: [],
      totalSteps: 0,
      modelName: this.modelName,
    };
  }

  encodeImageToBase64(imagePath) {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      return imageBuffer.toString("base64");
    } catch (error) {
      throw new Error(`Failed to encode image: ${error.message}`);
    }
  }

  async analyzeWithClaude(
    imagePath,
    userPrompt = null,
    systemMessage,
    currentTask = null,
    currentStepIndex = 0,
    taskSteps = [],
    currentSubStepIndex = 0
  ) {
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

      const newMessage = userPrompt
        ? {
            role: "user",
            content: [
              {
                type: "text",
                text: userPrompt,
              },
              imageContent,
            ],
          }
        : {
            role: "user",
            content: [imageContent],
          };

      messages.push(newMessage);

      // Prepare API request data
      const apiRequest = {
        model: this.modelName,
        max_tokens: 1000,
        temperature: 0.1,
        system: systemMessage,
        messages: messages,
      };

      const response = await this.anthropic.messages.create(apiRequest);

      const aiResponse = response.content[0].text;

      // Track token usage
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const totalTokens = inputTokens + outputTokens;

      // Update total token counts
      this.tokenUsage.totalInputTokens += inputTokens;
      this.tokenUsage.totalOutputTokens += outputTokens;
      this.tokenUsage.totalSteps++;

      // Log current step token usage
      const stepInfo = {
        step: this.tokenUsage.totalSteps,
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        totalTokens: totalTokens,
        stepDescription: currentTask
          ? currentSubStepIndex > 0
            ? `Step ${currentStepIndex + 1}/${taskSteps.length} - Sub-step ${
                currentSubStepIndex + 1
              }`
            : `Step ${currentStepIndex + 1}/${taskSteps.length}`
          : "Single Action",
        timestamp: new Date().toISOString(),
      };

      this.tokenUsage.stepUsage.push(stepInfo);

      // Log token usage for this step
      this.logger.info(
        `🔢 Token usage - Step ${this.tokenUsage.totalSteps}: Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`
      );

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
        this.rawMessagesPosted.push(newMessage);
      }
      this.conversationHistory.push(assistantMessage);
      this.fullConversationHistory.push(assistantMessage);
      this.rawMessagesPosted.push(assistantMessage);

      // Keep conversation history manageable for API calls (save tokens)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Log full conversation count
      this.logger.debug(
        `Conversation history: ${this.conversationHistory.length} messages (API), ${this.fullConversationHistory.length} messages (full log)`
      );

      // Dump API request to file
      this.dumpApiRequest({
        model: this.modelName,
        max_tokens: 1000,
        temperature: 0.1,
        system: systemMessage,
        messages: this.rawMessagesPosted,
      });

      return aiResponse;
    } catch (error) {
      throw new Error(`Claude analysis failed: ${error.message}`);
    }
  }

  async analyzeWithPromptOnly(
    userPrompt,
    systemMessage,
    currentTask = null,
    currentStepIndex = 0,
    taskSteps = [],
    currentSubStepIndex = 0
  ) {
    try {
      const messages = [...this.conversationHistory];

      if (!userPrompt) {
        throw new Error("Prompt is required for prompt-only analysis");
      }
      const newMessage = {
        role: "user",
        content: userPrompt,
      };
      messages.push(newMessage);

      // Prepare API request data
      const apiRequest = {
        model: this.modelName,
        max_tokens: 1000,
        temperature: 0.1,
        system: systemMessage,
        messages: messages,
      };

      const response = await this.anthropic.messages.create(apiRequest);

      const aiResponse = response.content[0].text;

      // Track token usage
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const totalTokens = inputTokens + outputTokens;

      // Update total token counts
      this.tokenUsage.totalInputTokens += inputTokens;
      this.tokenUsage.totalOutputTokens += outputTokens;
      this.tokenUsage.totalSteps++;

      // Log current step token usage
      const stepInfo = {
        step: this.tokenUsage.totalSteps,
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        totalTokens: totalTokens,
        stepDescription: currentTask
          ? currentSubStepIndex > 0
            ? `Step ${currentStepIndex + 1}/${taskSteps.length} - Sub-step ${
                currentSubStepIndex + 1
              }`
            : `Step ${currentStepIndex + 1}/${taskSteps.length}`
          : "Prompt Only Analysis",
        timestamp: new Date().toISOString(),
      };

      this.tokenUsage.stepUsage.push(stepInfo);

      // Log token usage for this step
      this.logger.info(
        `🔢 Token usage - Step ${this.tokenUsage.totalSteps}: Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`
      );

      // Update conversation history
      const userMessage = {
        role: "user",
        content: userPrompt,
      };

      const assistantMessage = {
        role: "assistant",
        content: aiResponse,
      };

      // Update both histories
      this.conversationHistory.push(userMessage);
      this.fullConversationHistory.push(userMessage);
      this.rawMessagesPosted.push(newMessage);
      this.conversationHistory.push(assistantMessage);
      this.fullConversationHistory.push(assistantMessage);
      this.rawMessagesPosted.push(assistantMessage);

      // Keep conversation history manageable for API calls (save tokens)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Log full conversation count
      this.logger.debug(
        `Conversation history: ${this.conversationHistory.length} messages (API), ${this.fullConversationHistory.length} messages (full log)`
      );

      // Dump API request to file
      this.dumpApiRequest({
        model: this.modelName,
        max_tokens: 1000,
        temperature: 0.1,
        system: systemMessage,
        messages: this.rawMessagesPosted,
      });

      return aiResponse;
    } catch (error) {
      throw new Error(`Claude prompt-only analysis failed: ${error.message}`);
    }
  }

  // Dump API request to file for debugging
  dumpApiRequest(apiRequest) {
    try {
      this.logger.dumpFile(
        JSON.stringify(apiRequest, null, 2),
        "anthropic_post.json"
      );
    } catch (error) {
      this.logger.error(`Failed to dump API request: ${error.message}`);
    }
  }

  // Display token usage summary
  displayTokenUsageSummary() {
    const totalTokens =
      this.tokenUsage.totalInputTokens + this.tokenUsage.totalOutputTokens;

    this.logger.separator("📊 TOKEN USAGE SUMMARY");
    this.logger.info(`Model: ${this.tokenUsage.modelName}`);
    this.logger.info(`Total API Calls: ${this.tokenUsage.totalSteps}`);
    this.logger.info(
      `Total Input Tokens: ${this.tokenUsage.totalInputTokens.toLocaleString()}`
    );
    this.logger.info(
      `Total Output Tokens: ${this.tokenUsage.totalOutputTokens.toLocaleString()}`
    );
    this.logger.info(`Total Tokens Used: ${totalTokens.toLocaleString()}`);

    // Estimate cost (Claude 3.5 Sonnet pricing as of last update)
    const inputCost = (this.tokenUsage.totalInputTokens / 1000000) * 3.0; // $3 per million input tokens
    const outputCost = (this.tokenUsage.totalOutputTokens / 1000000) * 15.0; // $15 per million output tokens
    const totalCost = inputCost + outputCost;

    this.logger.info(
      `Estimated Cost: $${totalCost.toFixed(4)} (Input: $${inputCost.toFixed(
        4
      )}, Output: $${outputCost.toFixed(4)})`
    );

    // Show per-step breakdown if more than 1 step
    if (this.tokenUsage.stepUsage.length > 1) {
      this.logger.info("\n📋 Per-Step Breakdown:");
      this.tokenUsage.stepUsage.forEach((step, index) => {
        this.logger.info(
          `  ${index + 1}. ${step.stepDescription}: ${
            step.totalTokens
          } tokens (${step.inputTokens} in, ${step.outputTokens} out)`
        );
      });
    }

    // Save token usage to file
    const tokenSummary = {
      summary: {
        modelName: this.tokenUsage.modelName,
        totalSteps: this.tokenUsage.totalSteps,
        totalInputTokens: this.tokenUsage.totalInputTokens,
        totalOutputTokens: this.tokenUsage.totalOutputTokens,
        totalTokens: totalTokens,
        estimatedCost: totalCost,
      },
      stepBreakdown: this.tokenUsage.stepUsage,
    };

    this.logger.dumpFile(
      JSON.stringify(tokenSummary, null, 2),
      "token-usage-summary.json"
    );
    this.logger.separator();
  }

  // Get conversation histories
  getConversationHistory() {
    return this.conversationHistory;
  }

  getFullConversationHistory() {
    return this.fullConversationHistory;
  }

  // Get token usage
  getTokenUsage() {
    return this.tokenUsage;
  }

  // Reset conversation history
  resetConversationHistory() {
    this.conversationHistory = [];
    this.fullConversationHistory = [];
  }
}

module.exports = AnthropicClient;
