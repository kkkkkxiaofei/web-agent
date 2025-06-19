# Web Automation MCP Server

This directory contains both a standalone web automation agent and an MCP (Model Context Protocol) server that exposes web automation capabilities as tools for AI assistants.

## Modes of Operation

### 1. Local Mode (Original)

Run the web agent locally with interactive or autonomous modes:

```bash
npm start
```

### 2. MCP Server Mode (New)

Run as an MCP server to provide web automation tools to AI assistants:

```bash
npm run mcp-server
```

## MCP Server Capabilities

The MCP server exposes the following tools:

### Navigation Tools

- **web_navigate**: Navigate to a URL and automatically collect detailed information about all interactive elements
- **web_screenshot**: Take a screenshot of the current page
- **web_highlight_elements**: Highlight interactive elements with numbers
- **web_refresh_elements**: Refresh and get detailed information about all interactive elements on the current page

### Interaction Tools

- **web_click**: Click on a web element by its highlighted number
- **web_type**: Type text into an input field
- **web_clear**: Clear the content of an input field
- **web_select**: Select an option from a dropdown
- **web_hover**: Hover over a web element
- **web_press_key**: Press keyboard keys or key combinations
- **web_scroll**: Scroll the page up or down
- **web_wait**: Wait for a specified number of seconds

### Analysis Tools

- **web_analyze**: Analyze the current page content with AI

## Enhanced Navigation Response

When using `web_navigate`, the MCP server automatically:

1. **Navigates** to the specified URL
2. **Highlights** all interactive elements with numbered overlays
3. **Collects** detailed information about each element including:

   - Element ID (for referencing in other actions)
   - HTML tag name and type
   - Text content and placeholder text
   - Links (href attributes)
   - Current values for inputs
   - Available options for dropdowns
   - Accessibility information (aria-label, title, etc.)
   - Position and visibility status
   - Disabled/required status

4. **Returns** a comprehensive summary that tells the AI exactly what actions can be taken next

### Example Navigation Response

```
Navigated to: https://example.com

Page Information:
- Title: Example Website
- URL: https://example.com
- Interactive Elements Found: 8

Available Interactive Elements:

[1] INPUT (email) - Placeholder: "Enter your email"
[2] INPUT (password) - Placeholder: "Enter your password" - REQUIRED
[3] BUTTON - "Sign In"
[4] A - "Forgot Password?" - Link: https://example.com/reset
[5] SELECT - Options: Select Country, United States, Canada, United Kingdom
[6] TEXTAREA - Placeholder: "Enter your message"
[7] BUTTON - "Submit" - DISABLED
[8] A - "Create Account" - Link: https://example.com/signup
```

This detailed response allows the AI to understand exactly what elements are available and how to interact with them using the numbered IDs.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set up your environment variables in `.env`:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Using with MCP Client

### Configuration Example (Claude Desktop)

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "web-automation": {
      "command": "node",
      "args": ["/path/to/your/project/mcp_server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Usage Example

Once connected, you can use the web automation tools in your AI assistant:

1. Navigate to a website:

   ```
   Use web_navigate to go to https://example.com
   ```

2. Highlight interactive elements:

   ```
   Use web_highlight_elements to show me clickable elements
   ```

3. Take a screenshot:

   ```
   Use web_screenshot to capture the current page
   ```

4. Interact with elements:

   ```
   Use web_click with element_id "5" to click the login button
   Use web_type with element_id "2" and text "username@example.com"
   ```

5. Analyze content:
   ```
   Use web_analyze with prompt "What information is displayed on this page?"
   ```

## Key Features

- **Element Highlighting**: Interactive elements are automatically numbered for easy reference
- **Visual Feedback**: Screenshots and element highlighting provide visual context
- **AI Analysis**: Built-in AI analysis capabilities using Claude
- **Error Handling**: Comprehensive error handling and logging
- **Cleanup**: Automatic browser cleanup on exit

## Browser Configuration

The MCP server runs Chrome with the same configuration as the local mode:

- Non-headless mode for debugging
- Disabled web security for SSO compatibility
- Optimized timeouts and viewport settings
- Request interception for monitoring

## Logging

All MCP server activities are logged to `logs/mcp-server-[timestamp].log` with detailed information about:

- Tool execution
- Browser interactions
- AI analysis results
- Error messages

## Differences from Local Mode

| Feature                | Local Mode                      | MCP Server Mode            |
| ---------------------- | ------------------------------- | -------------------------- |
| **Execution**          | Interactive/Autonomous          | Tool-based via MCP         |
| **AI Integration**     | Built-in conversation flow      | Per-request analysis       |
| **Task Planning**      | Multi-step autonomous execution | Individual tool calls      |
| **Screenshots**        | Session-based naming            | Timestamp-based naming     |
| **Browser Management** | Session-based                   | Per-request initialization |

## Development

The MCP server maintains the same core functionality as the local agent but restructures it for tool-based access. The `WebAutomationMCPServer` class encapsulates all the original capabilities while providing a clean MCP interface.

Key architectural decisions:

- Reuses existing `AnthropicClient`, `Logger`, and `Prompts` modules
- Maintains browser instance across tool calls for efficiency
- Provides identical action parsing and execution logic
- Adds proper MCP error handling and response formatting
