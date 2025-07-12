// ========================================
// TOOL CONFIGURATION - Enable/Disable Tools
// ========================================
const TOOL_CONFIG = {
  web_navigate: true, // Navigate to URLs and highlight elements
  web_click: true, // Click on elements
  web_type: true, // Type text into inputs
  web_scroll: true, // Scroll page up/down
  web_select: false, // Select dropdown options
  web_hover: false, // Hover over elements
  web_press_key: true, // Press keyboard keys
  web_wait: true, // Wait for specified time
  web_clear: false, // Clear input fields
  web_screenshot: true, // Take screenshots
  web_analyze: true, // AI vision analysis of page
};

// Helper function to get enabled tools
function getEnabledTools() {
  const allTools = [
    {
      name: "web_navigate",
      description:
        "Navigate to a URL and automatically highlight all interactive elements with numbered overlays. Returns detailed DOM hierarchy about each element with [ref=X] as element_id, including type, text content, placeholders, options, and more to help you understand what actions can be taken on the page.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to navigate to (e.g., 'https://example.com')",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "web_click",
      description:
        "Click on a web element using its reference number from the DOM hierarchy. The element must be referenced as [ref=X] in the DOM hierarchy. Use the reference number (e.g., '1', '5', '12') that corresponds to the interactive element you want to click.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '1', '5', '12') corresponding to the [ref=X] element you want to click",
          },
        },
        required: ["element_id"],
      },
    },
    {
      name: "web_type",
      description:
        "Type text into an input field, textarea, or other text-editable element using its reference number from the DOM hierarchy. The element must be referenced as [ref=X] in the DOM hierarchy output from the previous web_navigate step.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '3') corresponding to the [ref=X] input field you want to type into",
          },
          text: {
            type: "string",
            description: "The text to type into the field",
          },
        },
        required: ["element_id", "text"],
      },
    },
    {
      name: "web_scroll",
      description:
        "Scroll the page vertically to reveal more content. Useful for long pages, infinite scroll, or accessing elements outside the current viewport.",
      inputSchema: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down"],
            description: "The direction to scroll ('up' or 'down')",
          },
          amount: {
            type: "number",
            description:
              "Optional scroll distance in pixels (default: 500, range: 1-5000)",
          },
        },
        required: ["direction"],
      },
    },
    {
      name: "web_select",
      description:
        "Select an option from a dropdown menu or select element using its reference number from the DOM hierarchy. The element must be referenced as [ref=X] in the DOM hierarchy output from the previous web_navigate step. Works with both standard HTML select elements and custom dropdown implementations.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '4') corresponding to the [ref=X] dropdown element you want to select from",
          },
          option: {
            type: "string",
            description:
              "The option text or value to select (e.g., 'United States', 'option-value-123')",
          },
        },
        required: ["element_id", "option"],
      },
    },
    {
      name: "web_hover",
      description:
        "Hover the mouse over a web element using its reference number from the DOM hierarchy to trigger hover effects, reveal hidden menus, or show tooltips. The element must be referenced as [ref=X] in the DOM hierarchy output from the previous web_navigate step. Useful for dropdown menus and interactive elements.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '7') corresponding to the [ref=X] element you want to hover over",
          },
        },
        required: ["element_id"],
      },
    },
    {
      name: "web_press_key",
      description:
        "Press keyboard keys or key combinations to trigger shortcuts, submit forms, navigate, or perform other keyboard-based actions.",
      inputSchema: {
        type: "object",
        properties: {
          keys: {
            type: "string",
            description:
              "The key or key combination to press. Examples: 'Enter', 'Tab', 'Escape', 'Ctrl+A', 'Shift+Tab', 'Ctrl+C', 'Ctrl+V'",
          },
        },
        required: ["keys"],
      },
    },
    {
      name: "web_wait",
      description:
        "Pause execution for a specified time to wait for page loads, animations, or dynamic content to appear. Useful when pages need time to update after interactions.",
      inputSchema: {
        type: "object",
        properties: {
          seconds: {
            type: "number",
            description:
              "The number of seconds to wait. Supports decimals for precise timing (e.g., 1.5, 2.0, 0.5). Range: 0.1-60 seconds",
          },
        },
        required: ["seconds"],
      },
    },
    {
      name: "web_clear",
      description:
        "Clear all text content from an input field, textarea, or other editable element using its reference number from the DOM hierarchy. The element must be referenced as [ref=X] in the DOM hierarchy output from the previous web_navigate step. Equivalent to selecting all text and deleting it.",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description:
              "The reference number from the DOM hierarchy (e.g., '2') corresponding to the [ref=X] input field you want to clear",
          },
        },
        required: ["element_id"],
      },
    },
    {
      name: "web_screenshot",
      description:
        "Capture a screenshot of the current page state for visual reference or debugging.",
      inputSchema: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description:
              "Optional custom filename for the screenshot (without extension). If not provided, a timestamp-based name will be used.",
          },
        },
      },
    },
    {
      name: "web_analyze",
      description:
        "Analyze the current page content using AI's capabilities of understanding screenshot. ONLY use this tool when the user explicitly mentions 'analyze page' or 'extract info from the page'.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "The analysis question or instruction (e.g., 'What products are shown on this page?', 'Is the login successful?', 'Extract all the prices displayed')",
          },
        },
        required: ["prompt"],
      },
    },
  ];

  // Filter tools based on configuration
  return allTools.filter((tool) => TOOL_CONFIG[tool.name]);
}

export { getEnabledTools, TOOL_CONFIG };
