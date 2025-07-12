# Puppeteer AI Agent

An AI-powered web browser agent that combines GPT-4V and Puppeteer to browse the web, take screenshots, interact with web elements, and perform automated tasks.

**✨ Now supports custom OpenAI-compatible APIs! ✨**

## Features

- **Screenshot Capture**: Take high-quality screenshots of web pages
- **AI Vision Analysis**: Use GPT-4V to analyze and understand web page content
- **Interactive Web Agent**: Click buttons, fill forms, navigate websites automatically
- **Element Highlighting**: Automatically highlight and number interactive elements
- **Conversational Interface**: Chat with the AI agent to perform web tasks
- **Custom API Support**: Works with OpenAI-compatible APIs (configured for api.omnia.reainternal.net)

## Components

### 1. screenshot.js

Basic screenshot functionality using Puppeteer.

### 2. vision_scraper.py

Python script that combines screenshot capture with GPT-4V analysis.

### 3. web_agent.js

Advanced interactive web agent with full browsing capabilities.

### 4. Custom API Clients

- `custom_openai_client.py` - Python client for OpenAI-compatible APIs
- `custom_openai_client.js` - Node.js client for OpenAI-compatible APIs

## Setup

### Prerequisites

- Node.js (v16 or higher)
- Python 3.7 or higher
- API key for OpenAI-compatible service (configured for api.omnia.reainternal.net)

### Installation

1. **Clone or download the project**

2. **Install Node.js dependencies:**

   ```bash
   npm install
   ```

3. **Install Python dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables:**
   ```bash
   cp env.example .env
   ```
   Edit `.env` and add your API key:
   ```
   OPENAI_API_KEY=your_actual_api_key_here
   ```

## API Configuration

This project is pre-configured to work with the OpenAI-compatible API at `https://api.omnia.reainternal.net`. The custom clients automatically route requests to this endpoint while maintaining full compatibility with the OpenAI SDK interface.

### Custom API Features

- **Automatic Endpoint Routing**: Requests are automatically sent to api.omnia.reainternal.net
- **Full Compatibility**: Same interface as OpenAI SDK
- **Error Handling**: Comprehensive error handling and timeout management
- **No External Dependencies**: Custom clients use only built-in Node.js/Python libraries

### Changing API Endpoint

To use a different OpenAI-compatible endpoint, modify the `baseURL` parameter in the custom clients:

**Python (custom_openai_client.py):**

```python
client = CustomOpenAIClient(
    api_key="your_key",
    base_url="https://your-custom-endpoint.com"
)
```

**Node.js (custom_openai_client.js):**

```javascript
const client = new OpenAI({
  apiKey: "your_key",
  baseURL: "https://your-custom-endpoint.com",
});
```

## Usage

### Basic Screenshot

Take a screenshot of any webpage:

```bash
node screenshot.js https://example.com
```

Optional timeout parameter (in milliseconds):

```bash
node screenshot.js https://example.com 30000
```

### Vision Scraper

Analyze a webpage with AI:

```bash
python vision_scraper.py
```

Follow the prompts to enter a URL and analysis request.

### Interactive Web Agent

Start the full interactive agent:

```bash
npm start
# or
node web_agent.js
```

#### Agent Commands

Once the agent is running, you can:

- **Navigate**: Enter any URL (e.g., `https://google.com`)
- **Ask questions**: "What's on this page?", "Find the search button"
- **Request actions**: "Click on the login button", "Search for puppeteer"
- **Exit**: Type `quit` to stop

#### Available Actions

The AI agent can perform these actions:

- `CLICK:[element_id]` - Click on numbered elements
- `TYPE:[element_id]:[text]` - Type text into input fields
- `FETCH:[url]` - Navigate to a new URL
- `SCROLL:[up/down]` - Scroll the page
- `ANALYZE` - Just analyze without taking action
- `COMPLETE` - Mark task as finished

## How It Works

### Element Highlighting

The agent automatically:

1. Finds all interactive elements (buttons, links, inputs, etc.)
2. Filters for visible elements within the viewport
3. Adds yellow borders and numbered overlays
4. Uses these numbers as element IDs for interaction

### AI Integration

1. Takes a screenshot of the current page
2. Highlights interactive elements
3. Sends the image to GPT-4V via custom API client
4. Receives AI analysis and action recommendations
5. Executes the recommended actions automatically

### Custom API Integration

The custom API clients provide:

- **Seamless Integration**: Drop-in replacement for OpenAI SDK
- **Custom Endpoint**: Pre-configured for api.omnia.reainternal.net
- **Error Handling**: Robust error handling and retry logic
- **Performance**: Optimized for reliability and speed

## Example Workflows

### Web Search

```
You: https://google.com
AI: I can see the Google homepage with a search box...
You: Search for "web scraping with puppeteer"
AI: I'll type that in the search box and click search.
```

### Form Filling

```
You: https://example-form.com
AI: I can see a contact form with name, email, and message fields...
You: Fill out the form with my information
AI: I'll help you fill out each field. What's your name?
```

### Data Extraction

```
You: https://news-website.com
AI: I can see several news articles on the page...
You: What are the top 3 headlines?
AI: Here are the top 3 headlines I can see: 1. ... 2. ... 3. ...
```

## Configuration

### Browser Settings

Edit `web_agent.js` to modify browser behavior:

```javascript
this.browser = await puppeteer.launch({
  headless: false, // Set to true for headless mode
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    // Add more Chrome flags as needed
  ],
});
```

### Viewport Size

Change the viewport dimensions:

```javascript
await this.page.setViewport({
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
});
```

## Troubleshooting

### Common Issues

1. **"API key not found"**

   - Make sure your `.env` file contains a valid `OPENAI_API_KEY`

2. **"Browser failed to launch"**

   - Install Chrome/Chromium: `sudo apt-get install chromium-browser`
   - Or use bundled Chromium: The script will download it automatically

3. **"Module not found"**

   - Run `npm install` to install Node.js dependencies
   - Run `pip install -r requirements.txt` for Python dependencies

4. **"API request failed"**

   - Check your API key is valid for api.omnia.reainternal.net
   - Verify network connectivity to the custom endpoint
   - Check if your API key has the required permissions

5. **Timeout errors**
   - Increase timeout values for slow websites or API responses
   - Check your internet connection

### Performance Tips

- Use headless mode for better performance
- Reduce screenshot quality for faster processing
- Limit conversation history to prevent memory issues
- Custom API clients include automatic retry logic

## Security Notes

- Never commit your `.env` file with real API keys
- Be cautious when running on untrusted websites
- The agent has full browser access - use responsibly
- Custom API endpoint is pre-configured - verify it matches your requirements

## Custom API Client Details

### Python Client Features

- Full OpenAI SDK compatibility
- Automatic request/response handling
- Built-in error handling and retries
- Uses only `requests` library (no external AI SDK dependencies)

### Node.js Client Features

- Drop-in replacement for OpenAI SDK
- Native Node.js HTTP/HTTPS support
- Promise-based async/await interface
- No external dependencies beyond built-in Node.js modules

## Contributing

Feel free to submit issues and enhancement requests! The custom API clients are designed to be easily extensible for additional OpenAI-compatible endpoints.

## License

MIT License - feel free to use and modify as needed.
