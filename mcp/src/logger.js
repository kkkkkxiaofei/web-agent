import fs from "fs";
import path from "path";

class Logger {
  constructor(options = {}) {
    this.logFile =
      options.logFile === null ? null : options.logFile || "log.txt";
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

    // Ensure log directory exists (only if logFile is not null)
    if (this.logFile !== null) {
      this.ensureLogDirectory();
    }
  }

  ensureLogDirectory() {
    if (this.logFile === null) return;

    const logDir = path.dirname(this.logFile);
    if (logDir !== "." && !fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (error) {
        // If we can't create the log directory, fall back to current directory
        console.error(
          `Warning: Could not create log directory '${logDir}': ${error.message}`
        );
        console.error("Falling back to current directory for logging");
        this.logFile = path.basename(this.logFile);
      }
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
    if (this.logFile === null) return; // Skip file writing when logFile is null

    try {
      fs.appendFileSync(this.logFile, message + "\n", "utf8");
    } catch (error) {
      console.error("Failed to write to log file:", error.message);
    }
  }

  dumpFile(content, filename) {
    if (this.logFile === null) {
      // When no logFile is set, skip file dumping
      console.error("File dumping disabled (no log file configured)");
      return;
    }

    const logDir = path.dirname(this.logFile);
    let filePath = `${logDir}/${filename}`;

    // If logDir is current directory, just use filename
    if (logDir === ".") {
      filePath = filename;
    }

    try {
      fs.writeFileSync(filePath, content, "utf8");
    } catch (error) {
      // Fallback to current directory
      console.error(
        `Warning: Could not write to '${filePath}': ${error.message}`
      );
      try {
        fs.writeFileSync(filename, content, "utf8");
        console.error(`File saved to current directory: ${filename}`);
      } catch (fallbackError) {
        console.error(
          `Failed to write file '${filename}': ${fallbackError.message}`
        );
      }
    }
  }

  log(level, message, data = null, options = {}) {
    const showInTerminal =
      options.showInTerminal !== undefined
        ? options.showInTerminal
        : this.showInTerminal;
    const formatted = this.formatMessage(level, message, data);

    // Write to file only if logFile is configured
    if (this.logFile !== null) {
      this.writeToFile(formatted.fileMessage);
    }

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
    if (this.logFile === null) {
      console.error("Log clearing disabled (no log file configured)");
      return;
    }

    try {
      fs.writeFileSync(this.logFile, "", "utf8");
      this.info("Log file cleared");
    } catch (error) {
      this.error("Failed to clear log file", error.message);
    }
  }

  // Method to get recent logs
  getRecentLogs(lines = 50) {
    if (this.logFile === null) {
      console.error("Log reading disabled (no log file configured)");
      return "";
    }

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

export default Logger;
