const Logger = require("./logger");

// Example 1: Default logger (shows in terminal + saves to log.txt)
console.log("=== Example 1: Default Logger ===");
const defaultLogger = new Logger();

defaultLogger.info("This is an info message");
defaultLogger.success("This is a success message");
defaultLogger.warning("This is a warning message");
defaultLogger.error("This is an error message");
defaultLogger.debug("This is a debug message");

// Example 2: Silent logger (only saves to file, no terminal output)
console.log("\n=== Example 2: Silent Logger ===");
const silentLogger = new Logger({
  logFile: "silent.log",
  showInTerminal: false,
});

silentLogger.info("This message only goes to silent.log file");
silentLogger.error("This error only goes to silent.log file");
console.log("Check silent.log file to see the messages above");

// Example 3: Custom log file with selective terminal output
console.log("\n=== Example 3: Selective Terminal Output ===");
const customLogger = new Logger({
  logFile: "custom.log",
  showInTerminal: true,
});

// These will show in terminal AND save to file
customLogger.task("Starting important task");
customLogger.step("Executing step 1");
customLogger.ai("AI is processing...");
customLogger.user("User input received");

// These will only save to file (override terminal visibility)
customLogger.debug("Debug info", null, { showInTerminal: false });
customLogger.info("Detailed info", null, { showInTerminal: false });

// Example 4: Logging with additional data
console.log("\n=== Example 4: Logging with Data ===");
customLogger.info("User logged in", {
  userId: 123,
  timestamp: new Date().toISOString(),
  ip: "192.168.1.1",
});

customLogger.error("API call failed", {
  endpoint: "/api/users",
  statusCode: 500,
  errorMessage: "Internal server error",
});

// Example 5: Logger utility methods
console.log("\n=== Example 5: Utility Methods ===");
customLogger.separator("Starting New Session");
customLogger.info("Session started");
customLogger.info("Processing data...");
customLogger.separator("Session Complete");

// Toggle terminal visibility
console.log("\n=== Example 6: Toggle Terminal Visibility ===");
customLogger.setTerminalVisibility(false);
customLogger.info("This will only go to file now");

customLogger.setTerminalVisibility(true);
customLogger.success("Terminal visibility restored");

// Get recent logs
console.log("\n=== Example 7: Reading Recent Logs ===");
const recentLogs = customLogger.getRecentLogs(5);
console.log("Recent logs from file:");
console.log(recentLogs);

console.log("\n=== Logger Examples Complete ===");
console.log("Check the following files:");
console.log("- log.txt (default logger output)");
console.log("- silent.log (silent logger output)");
console.log("- custom.log (custom logger output)");
