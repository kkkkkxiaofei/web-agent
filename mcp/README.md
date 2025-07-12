# Puppeteer MCP Server

An AI-powered web browser automation server built with Puppeteer and Claude AI, implementing the Model Context Protocol (MCP) for seamless integration with AI assistants.

## 🚀 Exposed MCP tools

- `web_navigate`: Navigate to a URL
- `web_click`: Click on an element
- `web_type`: Type text into an input field
- `web_scroll`: Scroll to an element
- `web_press_key`: Press a key
- `web_wait`: Wait for a few seconds
- `web_screenshot`: Take a screenshot of the current page
- `web_analyze`: Analyze page content from screenshots

## 🛠️ Installation

### Prerequisites

- Node.js 16 or higher
- Anthropic API key (for Claude AI integration)

### Setup


1. **Configure environment variables**

   ```bash
   cp env.example .env
   ```

   Edit `.env` file:

   ```env
   # Required: Anthropic Claude API Key
   ANTHROPIC_API_KEY=your_claude_api_key_here
   ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

   # Optional: Browser mode (default: false for visible browser)
   HEADLESS_MODE=false
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. MCP settings

- Cursor:
  - CMD + Shift + P -> `Cursor Settings`
  - Search `Tools & Integrations`
  - New MCP Server
  - Add following settings:
```
{
  "mcpServers": {
    "web-agent": {
      "type": "stdio",
      "command": "node",
      "args": ["your absolute path to index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your_claude_api_key_here",
        "ANTHROPIC_MODEL": "claude-3-5-sonnet-20241022",
        "HEADLESS_MODE": "false"
      }
    }
  },
  "mcp.autoApproveTools": true,
  "mcp.trustedServers": ["web-agent"],
  "cursor.automaticToolExecution": true
}
```

- Claude Desktop:
  - Open $HOME/Library/Application Support/Claude/claude_desktop_config.json
  - Add following settings:
```
{
  "mcpServers": {
    "web-agent": {
      "type": "stdio",
      "command": "node",
      "args": ["your absolute path to index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your_claude_api_key_here",
        "ANTHROPIC_MODEL": "claude-3-5-sonnet-20241022",
        "HEADLESS_MODE": "false"
      }
    }
  }
}
```

## 🌐 How It Works

### Element Reference System

When navigating to a page, the server:

1. Collect all interactive elements
2. Returns a simplified DOM hierarchy with `[ref=X]` references attached to each element
3. Elements can be targeted using these reference numbers


Example DOM hierarchy generated from [npm official website](https://npmjs.com):

<details>
  <summary>Click to expand</summary>
  
```
Navigated to: https://npmjs.com

- Page Snapshot
- document [ref=s1e1]:
  - link "skip to content" [ref=s1e2]
    - /url: #main
  - link "skip to package search" [ref=s1e3]
    - /url: #search
  - link "skip to sign in" [ref=s1e4]
    - /url: #signin
  - span "❤"
  - list "Nav Menu"
    - listitem
      - menuitem "Pro" [ref=s1e5]
        - /url: /products/pro
    - listitem
      - menuitem "Teams" [ref=s1e6]
        - /url: /products/teams
    - listitem
      - menuitem "Pricing" [ref=s1e7]
        - /url: /products
    - listitem
      - menuitem "Documentation" [ref=s1e8]
        - /url: https://docs.npmjs.com
  - span "npm"
  - link "Npm" [ref=s1e9]
    - /url: /
  - form
    - input "Search packages" [ref=s1e10]
    - button "Search" [ref=s1e11]
  - link "Sign Up" [ref=s1e12]
    - /url: /signup
  - link "Sign In" [ref=s1e13]
    - /url: /login
  - heading "Build amazing things" [level=1]:
  - div "We're GitHub, the company behind the npm Registry and npm CLI. We offer those to the community for free, but our day job is building and selling useful tools for developers like you."
  - heading "Take your JavaScript development up a notch" [level=2]:
  - div "Get started today for free, or step up to npm Pro to enjoy a premium JavaScript development experience, with features like private packages."
  - link "Sign up for free" [ref=s1e14]
    - /url: /signup
  - link "Learn about Pro" [ref=s1e15]
    - /url: /products/pro
  - heading "Footer" [level=2]:
  - link "Visit npm GitHub page" [ref=s1e16]
    - /url: https://github.com/npm
  - link "GitHub" [ref=s1e17]
    - /url: https://github.com
  - heading "Support" [level=3]:
  - list
    - listitem
      - link "Help" [ref=s1e18]
        - /url: https://docs.npmjs.com
    - listitem
      - link "Advisories" [ref=s1e19]
        - /url: https://github.com/advisories
    - listitem
      - link "Status" [ref=s1e20]
        - /url: http://status.npmjs.org/
    - listitem
      - link "Contact npm" [ref=s1e21]
        - /url: /support
  - heading "Company" [level=3]:
  - list
    - listitem
      - link "About" [ref=s1e22]
        - /url: /about
    - listitem
      - link "Blog" [ref=s1e23]
        - /url: https://github.blog/tag/npm/
    - listitem
      - link "Press" [ref=s1e24]
        - /url: /press
  - heading "Terms & Policies" [level=3]:
  - list
    - listitem
      - link "Policies" [ref=s1e25]
        - /url: /policies/
    - listitem
      - link "Terms of Use" [ref=s1e26]
        - /url: /policies/terms
    - listitem
      - link "Code of Conduct" [ref=s1e27]
        - /url: /policies/conduct
    - listitem
      - link "Privacy" [ref=s1e28]
        - /url: /policies/privacy
```
</details>

### AI Integration

The `web_analyze` tool uses Claude AI's vision capabilities to:

- Analyze page content from screenshots
- Extract specific information based on prompts
- Provide intelligent insights about page state

## 📁 Project Structure

```
mcp/
├── index.js                 # Main MCP server entry point
├── package.json            # Dependencies and scripts
├── env.example             # Environment variables template
├── CHROME_SETUP.md         # Chrome setup instructions
├── src/
│   ├── tools.js            # Tool definitions and configuration
│   ├── tool_handlers.js    # Tool execution logic
│   ├── automation_server.js # Main automation server class
│   ├── puppeteer_manager.js # Puppeteer browser management
│   ├── page_hierarchy.js   # DOM hierarchy extraction
│   ├── anthropic_client.js # Claude AI integration
│   └── logger.js           # Logging utilities
├── test/                   # Test files
└── screenshots/            # Screenshot storage
```

## 🧪 Testing

Run the test suite:

```bash
npm test
```

Test with a sample HTML file:

```bash
node test/test_index_html.js
```

## 💡 Use Cases

- **Web Testing**: Automated testing of web applications
- **Data Extraction**: Scraping and analyzing web content
- **UI Automation**: Automating repetitive web tasks
- **Accessibility Testing**: Analyzing page accessibility
- **Performance Monitoring**: Capturing page performance metrics
- **AI-Assisted Browsing**: Intelligent web navigation and analysis

## Puppeteer restrictions

By default, Puppeteer will launch a new Chromium instance without any user profile, that being said, it can't automatically access the pages require user login.

However, you can manually launch a your Chrome with specified profile in debugging mode, allowing Puppeteer to interact with the current browser tab. For more details, please refer to [CHROME_SETUP.md](CHROME_SETUP.md).