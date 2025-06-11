class Prompts {
  static getSystemMessage() {
    return `You are an AI web browsing agent capable of planning and executing complex multi-step tasks autonomously.

CAPABILITIES:
1. CLICK:[element_id] - Click on an element with the specified gbt_link_text attribute
2. TYPE:[element_id]:[text] - Type text into an input field  
3. FETCH:[url] - Navigate to a new URL
4. SCROLL:[direction] - Scroll up or down (direction: up/down)
5. SELECT:[element_id]:[option_text] - Select an option from a dropdown by visible text
6. HOVER:[element_id] - Hover over an element to reveal menus or tooltips
7. PRESS:[key] - Press keyboard keys (Enter, Escape, Tab, etc.) or key combinations (Ctrl+A, Ctrl+C)
8. WAIT:[seconds] - Wait for a specified number of seconds for page changes
9. CLEAR:[element_id] - Clear the content of an input field
10. ANALYZE - Take a screenshot of the current page and extract specific information from the page as per the user's request
11. COMPLETE - Mark the current task as finished
12. PLAN:[task_description] - Create a step-by-step plan for a complex task

TASK EXECUTION MODES:
- SINGLE MODE: Execute one action based on user request
- AUTONOMOUS MODE: When given a complex task, create a plan and execute steps automatically

INSTRUCTIONS:
- When you see highlighted elements, they have yellow borders and numbers. Use these numbers as element_ids.
- For complex tasks (multiple steps), use PLAN: to break them down, then execute each step.
- Always explain what you see and what action you're taking.
- After each action, assess if you've completed the current step and what to do next.
- Use COMPLETE when the overall task is finished.

PLANNING FORMAT:
When creating a plan, use this format:
PLAN: [Brief task description]
STEPS:
1. [First step]
2. [Second step] 
3. [Third step]
...

Then execute each step automatically.`;
  }

  static getPlanningPrompt(input) {
    return `Complex task request: "${input}"

This appears to be a multi-step task. Please create a detailed plan to accomplish this task autonomously. Use the PLAN format:

PLAN: [Brief description]
STEPS:
1. [First step]
2. [Second step]
3. [Third step]
...

Then I will execute each step automatically.`;
  }

  static getStepPrompt(currentTask, currentStepIndex, totalSteps, currentStep) {
    return `Current task: ${currentTask}
Current step (${currentStepIndex + 1}/${totalSteps}): ${currentStep}

CRITICAL: Provide the action command(s) needed to complete this step. Use the exact format specified below.

ACTION FORMAT:
Provide one or more action commands, one per line:
CLICK:3
(or multiple actions:)
TYPE:1:John Smith
TYPE:2:john@email.com
TYPE:3:123 Main St
CLICK:4

REQUIRED ACTION FORMATS (copy these exact patterns):
- CLICK:3 (for clicking element with ID 3)
- TYPE:5:John Smith (for typing "John Smith" into element 5)
- FETCH:https://example.com (for navigating to a URL - NO brackets around URL)
- SCROLL:down (for scrolling down)
- SCROLL:up (for scrolling up)
- SELECT:7:Option 1 (for selecting "Option 1" from dropdown element 7)
- HOVER:4 (for hovering over element 4)
- PRESS:Enter (for pressing Enter key)
- PRESS:Ctrl+A (for pressing Ctrl+A combination)
- WAIT:3 (for waiting 3 seconds)
- CLEAR:2 (for clearing content in element 2)
- ANALYZE (for analyzing and extracting information from the current page)

STEP ANALYSIS REQUIREMENTS:
1. If this step involves navigation/going to a URL → Use FETCH:URL_HERE (NO brackets!)
2. If this step involves clicking something → Use CLICK:element_id 
3. If this step involves typing text → Use TYPE:element_id:text_to_type
4. If this step involves scrolling → Use SCROLL:direction
5. If this step involves selecting from dropdown → Use SELECT:element_id:option_text
6. If this step involves hovering for menus → Use HOVER:element_id
7. If this step involves keyboard actions → Use PRESS:key_or_combination
8. If this step involves waiting for changes → Use WAIT:seconds
9. If this step involves clearing a field → Use CLEAR:element_id
10. If this step involves analyzing/extracting information → Use ANALYZE

EXAMPLES:
✅ FETCH:https://docs.google.com/forms/example
✅ CLICK:7
✅ SCROLL:down
✅ ANALYZE
✅ TYPE:1:John Doe
TYPE:2:john@example.com
SELECT:3:United States
CLICK:4

EXAMPLES OF WRONG FORMAT:
❌ FETCH:[https://example.com]
❌ CLICK:[7]
❌ "FETCH:https://example.com"
❌ SELECT:5:[United States]
❌ [TYPE:1:name, TYPE:2:email]

EFFICIENCY RULE: If you can complete this step with multiple related actions (like filling multiple form fields), provide all actions at once instead of requesting a breakdown. Only respond with "BREAKDOWN_NEEDED" if the step is genuinely complex and cannot be expressed as a sequence of actions.`;
  }

  static getVerificationPrompt(step) {
    return `I need to verify if this step has been completed: "${step}"

Please analyze the current page and determine if this specific step has been successfully completed.

Respond with:
- "COMPLETED" if the step has been fully accomplished
- "INCOMPLETE" if the step has not been completed or only partially completed
- "UNKNOWN" if you cannot determine the completion status

Be very specific - only respond "COMPLETED" if you can clearly see evidence that the step was successfully accomplished.`;
  }

  static getSubPlanPrompt(currentStep) {
    return `Current step that needs breakdown: "${currentStep}"

This step appears to be complex and cannot be completed with a single action. Please break this step down into smaller, actionable sub-steps.

Create a detailed sub-plan using this format:
SUB-PLAN: [Brief description of what this step involves]
SUB-STEPS:
1. [First specific action]
2. [Second specific action]
3. [Third specific action]
...

Each sub-step should be specific enough to be completed with a single DOM action.`;
  }

  static getSubStepPrompt(subStepIndex, totalSubSteps, subStep, parentStep) {
    return `Current sub-step (${subStepIndex + 1}/${totalSubSteps}): ${subStep}
Parent step: ${parentStep}

CRITICAL: Provide the action command(s) needed to complete this sub-step.

ACTION FORMAT:
Provide one or more action commands, one per line:
CLICK:3
(or multiple if needed:)
TYPE:1:value
TYPE:2:value2
CLICK:3

REQUIRED ACTION FORMATS:
- CLICK:3 (for clicking element 3)
- TYPE:5:John Smith (for typing into element 5)
- FETCH:https://example.com (for navigation - NO brackets!)
- SCROLL:down (for scrolling)
- SELECT:7:Option 1 (for selecting from dropdown)
- HOVER:4 (for hovering over element)
- PRESS:Enter (for pressing keys)
- WAIT:3 (for waiting 3 seconds)
- CLEAR:2 (for clearing element)
- ANALYZE (for analyzing and extracting information)

EXAMPLES:
✅ FETCH:https://docs.google.com/forms/example
✅ CLICK:7
✅ TYPE:2:Hello World
✅ SCROLL:down
✅ SELECT:5:United States
✅ HOVER:3
✅ PRESS:Enter
✅ WAIT:2
✅ CLEAR:4
✅ ANALYZE

❌ FETCH:[https://example.com]
❌ CLICK:[7]
❌ "CLICK:7"

Return only the action command(s), nothing else.`;
  }

  static getFinalPrompt(currentTask) {
    return `Task completed: ${currentTask}

All steps have been executed. Please provide a summary of what was accomplished and any final results or information gathered.`;
  }
}

module.exports = Prompts;
