# Puppeteer AI Agent

An AI-powered web browser agent that combines claude-3-5-sonnet and Puppeteer to browse the web, take screenshots, interact with web elements, and perform automated tasks.

**✨ Now supports custom OpenAI-compatible APIs! ✨**

## Features

- **Screenshot Capture**: Take high-quality screenshots of web pages
- **AI Vision Analysis**: Use claude-3-5-sonnet to analyze and understand web page content
- **Interactive Web Agent**: Click buttons, fill forms, navigate websites automatically
- **Element Highlighting**: Automatically highlight and number interactive elements
- **Conversational Interface**: Chat with the AI agent to perform web tasks
- **Custom API Support**: Works with OpenAI-compatible APIs (configured for api.omnia.reainternal.net)

## Setup

### Prerequisites

- Node.js
- Anthropic API key

### Installation

1. **Set up environment variables:**

   ```bash
   cp env.example .env
   ```

   Edit `.env` and add your API key:

   ```
   OPENAI_API_KEY=your_actual_api_key_here
   ```

2. **Install Node.js dependencies:**

   ```bash
   npm install
   ```

1. **Start the agent:**

   ```bash
   npm run start
   ```


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
3. Sends the image to claude-3-5-sonnet
4. Receives AI analysis and action recommendations
5. Executes the recommended actions automatically

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
You: My name is Xiaofei Zhang, a fullstack developer, I'm looking for a job with an annual salary of 200K. I got an job application from my prefered company (https://docs.google.com/forms/d/e/1FAIpQLScmUIF_AC67QMy0LjA9TFF7slcFJjZuppoG7JBc7T_e4jOfEQ/viewform). Now I need you to go to this job application and help me to submit this form based on my background. Just a heads-up, this forms contains many required fields needs to be filled before get it submitted.

AI: I have successfully submitted the form with following information: ...
```

### Data Extraction

```
You: Go to https://npmjs.com and click the Pricing tab, tell me what the pricing is for each category in Pricing page

AI: The pricing is as follows: ...
```

## Puppeteer restriction

By default, the agent will launch a new instance of Chromium Puppeteer installed with for each task without user profiles, which means It can't access any pages that requires user login.







