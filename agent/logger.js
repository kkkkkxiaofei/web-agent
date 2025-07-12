const fs = require("fs");
const path = require("path");

class Logger {
  constructor(options = {}) {
    this.logFile = options.logFile || "log.txt";
    this.showInTerminal = options.showInTerminal !== false; // Default to true
    this.colors = {
      reset: "\x1b[0m",
      bright: "\x1b[1m",
      dim: "\x1b[2m",

      // Foreground colors
      black: "\x1b[30m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      magenta: "\x1b[35m",
      cyan: "\x1b[36m",
      white: "\x1b[37m",
      pink: "\x1b[38;5;200m",

      // Background colors
      bgRed: "\x1b[41m",
      bgGreen: "\x1b[42m",
      bgYellow: "\x1b[43m",
      bgBlue: "\x1b[44m",
      bgMagenta: "\x1b[45m",
      bgCyan: "\x1b[46m",
    };

    this.severityConfig = {
      DEBUG: { color: this.colors.bright + this.colors.cyan, prefix: "🔍" },
      INFO: { color: this.colors.bright + this.colors.blue, prefix: "ℹ️ " },
      SUCCESS: { color: this.colors.bright + this.colors.green, prefix: "✅" },
      WARNING: {
        color: this.colors.bright + this.colors.pink,
        prefix: "⚠️ ",
      },
      ERROR: { color: this.colors.bright + this.colors.red, prefix: "❌" },
      CRITICAL: {
        color: this.colors.bgRed + this.colors.bright + this.colors.white,
        prefix: "🚨",
      },
      TASK: { color: this.colors.bright + this.colors.magenta, prefix: "🎯" },
      STEP: { color: this.colors.bright + this.colors.cyan, prefix: "🔄" },
      AI: {
        color: this.colors.yellow,
        prefix: "🤖",
      },
      USER: {
        color: this.colors.bgGreen + this.colors.bright + this.colors.white,
        prefix: "👤",
      },
    };

    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    if (logDir !== "." && !fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  getTimestamp() {
    const now = new Date();
    return now.toISOString().replace("T", " ").replace("Z", "");
  }

  formatMessage(level, message, data = null) {
    const timestamp = this.getTimestamp();
    const config = this.severityConfig[level] || this.severityConfig.INFO;

    let formattedMessage = `[${timestamp}] [${level}] ${message}`;

    if (data) {
      if (typeof data === "object") {
        formattedMessage += "\n" + JSON.stringify(data, null, 2);
      } else {
        formattedMessage += ` | ${data}`;
      }
    }

    return {
      fileMessage: formattedMessage,
      consoleMessage:
        config.color +
        config.prefix +
        " " +
        message +
        this.colors.reset +
        (data
          ? typeof data === "object"
            ? "\n" + JSON.stringify(data, null, 2)
            : ` | ${data}`
          : ""),
    };
  }

  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + "\n", "utf8");
    } catch (error) {
      console.error("Failed to write to log file:", error.message);
    }
  }

  dumpFile(content, filename) {
    const logDir = path.dirname(this.logFile);
    const filePath = `${logDir}/${filename}`;
    fs.writeFileSync(filePath, content, "utf8");
  }

  log(level, message, data = null, options = {}) {
    const showInTerminal =
      options.showInTerminal !== undefined
        ? options.showInTerminal
        : this.showInTerminal;
    const formatted = this.formatMessage(level, message, data);

    // Always write to file
    this.writeToFile(formatted.fileMessage);

    // Conditionally show in terminal
    if (showInTerminal) {
      console.log(formatted.consoleMessage);
    }
  }

  // Convenience methods for different log levels
  debug(message, data = null, options = {}) {
    this.log("DEBUG", message, data, options);
  }

  info(message, data = null, options = {}) {
    this.log("INFO", message, data, options);
  }

  success(message, data = null, options = {}) {
    this.log("SUCCESS", message, data, options);
  }

  warning(message, data = null, options = {}) {
    this.log("WARNING", message, data, options);
  }

  error(message, data = null, options = {}) {
    this.log("ERROR", message, data, options);
  }

  critical(message, data = null, options = {}) {
    this.log("CRITICAL", message, data, options);
  }

  task(message, data = null, options = {}) {
    this.log("TASK", message, data, options);
  }

  step(message, data = null, options = {}) {
    this.log("STEP", message, data, options);
  }

  ai(message, data = null, options = {}) {
    this.log("AI", message, data, options);
  }

  user(message, data = null, options = {}) {
    this.log("USER", message, data, options);
  }

  // Method to toggle terminal visibility globally
  setTerminalVisibility(visible) {
    this.showInTerminal = visible;
  }

  // Method to clear log file
  clearLog() {
    try {
      fs.writeFileSync(this.logFile, "", "utf8");
      this.info("Log file cleared");
    } catch (error) {
      this.error("Failed to clear log file", error.message);
    }
  }

  // Method to get recent logs
  getRecentLogs(lines = 50) {
    try {
      const content = fs.readFileSync(this.logFile, "utf8");
      const logLines = content.trim().split("\n");
      return logLines.slice(-lines).join("\n");
    } catch (error) {
      this.error("Failed to read log file", error.message);
      return "";
    }
  }

  // Method to create a separator in logs
  separator(message = "", options = {}) {
    const line = "=".repeat(60);
    const separatorMessage = message ? `${line} ${message} ${line}` : line;
    this.log("INFO", separatorMessage, null, options);
  }
}

module.exports = Logger;
