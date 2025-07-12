const https = require("https");
const http = require("http");
const { URL } = require("url");

class ChatCompletion {
  constructor(responseData) {
    this.choices = (responseData.choices || []).map(
      (choice) => new Choice(choice)
    );
    this.id = responseData.id;
    this.object = responseData.object;
    this.created = responseData.created;
    this.model = responseData.model;
    this.usage = responseData.usage;
  }
}

class Choice {
  constructor(choiceData) {
    this.message = new Message(choiceData.message || {});
    this.index = choiceData.index;
    this.finish_reason = choiceData.finish_reason;
  }
}

class Message {
  constructor(messageData) {
    this.content = messageData.content;
    this.role = messageData.role;
  }
}

class ChatCompletions {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async create({
    model,
    messages,
    max_tokens = 1000,
    temperature = 0.1,
    ...kwargs
  }) {
    return await this.apiClient._makeChatRequest({
      model,
      messages,
      max_tokens,
      temperature,
      ...kwargs,
    });
  }
}

class Chat {
  constructor(apiClient) {
    this.completions = new ChatCompletions(apiClient);
  }
}

class CustomOpenAIClient {
  constructor({
    apiKey = null,
    baseURL = "https://api.omnia.reainternal.net",
  } = {}) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY;
    this.baseURL = baseURL.replace(/\/$/, "");
    this.chat = new Chat(this);

    if (!this.apiKey) {
      throw new Error(
        "API key is required. Set OPENAI_API_KEY environment variable or pass apiKey parameter."
      );
    }
  }

  _getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "CustomOpenAIClient/1.0",
    };
  }

  async _makeChatRequest({
    model,
    messages,
    max_tokens = 1000,
    temperature = 0.1,
    ...kwargs
  }) {
    const url = `${this.baseURL}/v1/chat/completions`;

    const payload = {
      model,
      messages,
      max_tokens,
      temperature,
      ...kwargs,
    };

    const headers = this._getHeaders();

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === "https:" ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(JSON.stringify(payload)),
        },
        timeout: 60000,
      };

      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const responseData = JSON.parse(data);
              resolve(new ChatCompletion(responseData));
            } else {
              let errorMessage;
              try {
                const errorData = JSON.parse(data);
                errorMessage =
                  errorData.error?.message || `HTTP ${res.statusCode}: ${data}`;
              } catch {
                errorMessage = `HTTP ${res.statusCode}: ${data}`;
              }
              reject(new Error(`API request failed: ${errorMessage}`));
            }
          } catch (parseError) {
            reject(
              new Error(`Failed to parse API response: ${parseError.message}`)
            );
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Request error: ${error.message}`));
      });

      req.on("timeout", () => {
        req.abort();
        reject(new Error("Request timeout"));
      });

      req.write(JSON.stringify(payload));
      req.end();
    });
  }
}

// Export for compatibility
class OpenAI extends CustomOpenAIClient {}

module.exports = { OpenAI, CustomOpenAIClient };
