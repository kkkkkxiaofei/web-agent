/**
 * DOM Hierarchy Generator
 * Extracts and formats the DOM structure focusing on interactive and semantic elements
 */

class DOMHierarchy {
  constructor() {
    this.elementMap = new Map();
    this.refCounter = 1;
    this.interactiveElements = new Set([
      "button",
      "input",
      "select",
      "textarea",
      "a",
      "img",
      "checkbox",
      "radio",
    ]);
    this.semanticElements = new Set([
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "nav",
      "main",
      "section",
      "article",
      "aside",
      "header",
      "footer",
      "ul",
      "ol",
      "li",
      "dl",
      "dt",
      "dd",
      "p",
    ]);
  }

  /**
   * Generate complete page hierarchy, requirements:
   - Include all interactive elements
   - Include all semantic elements
   - Include all text content
   - Include all images
   - Include all links
   - Include all buttons
   - persist the interactive elements in the elementMap
   - final output example:
   - Page Title: Job application form
- Page Snapshot
```yaml
- document [ref=s1e2]:
  - button "Edit this form" [ref=s1e6]:
    - img [ref=s1e10]
  - heading "Job application form" [level=1] [ref=s1e25]
  - text: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur quis sem odio. Sed commodo vestibulum leo, sit amet tempus odio consectetur in. Mauris dolor elit, dignissim mollis feugiat maximus, faucibus et eros. xifzhang@thoughtworks.com
  - link "Switch account" [ref=s1e35]:
    - /url: https://accounts.google.com/AccountChooser?continue=https://docs.google.com/forms/d/e/1FAIpQLScmUIF_AC67QMy0LjA9TFF7slcFJjZuppoG7JBc7T_e4jOfEQ/viewform&service=wise
  - img "Your email and Google account are not part of your response" [ref=s1e37]
  - text: Not shared
  - list [ref=s1e44]:
    - listitem [ref=s1e45]:
      - heading "Name Required question" [level=3] [ref=s1e50]: Name *
      - text: First and last name
      - textbox "Name Required question" [ref=s1e59]
    - listitem [ref=s1e64]:
      - heading "Email Required question" [level=3] [ref=s1e69]: Email *
      - textbox "Email Required question" [ref=s1e77]
    - listitem [ref=s1e82]:
      - heading "Phone number Required question" [level=3] [ref=s1e87]: Phone number *
      - textbox "Phone number Required question" [ref=s1e95]
    - listitem [ref=s1e100]:
      - heading "Which position(s) are you interested in? Required question" [level=3] [ref=s1e105]: Which position(s) are you interested in? *
      - list "Which position(s) are you interested in? Required question" [ref=s1e109]:
        - listitem [ref=s1e110]:
          - checkbox "Frontend" [ref=s1e113]
          - text: Frontend
        - listitem [ref=s1e123]:
          - checkbox "Backend" [ref=s1e126]
          - text: Backend
        - listitem [ref=s1e136]:
          - checkbox "Devops" [ref=s1e139]
          - text: Devops
        - listitem [ref=s1e149]:
          - checkbox "Archtecture" [ref=s1e152]
          - text: Archtecture
    - listitem [ref=s1e162]:
      - heading "What is your expected salary(per year)" [level=3] [ref=s1e167]
      - listbox "What is your expected salary(per year)" [ref=s1e170]:
        - option "Choose" [selected] [ref=s1e173]
        - option "50K" [ref=s1e176]
        - option "100K" [ref=s1e178]
        - option "200K" [ref=s1e180]
        - option "More than 200K" [ref=s1e182]
    - listitem [ref=s1e185]:
      - heading "What is your strength and weakness?" [level=3] [ref=s1e190]
      - textbox "What is your strength and weakness?" [ref=s1e196]
  - button "Submit" [ref=s1e204]
  - button "Clear form" [ref=s1e209]
  - text: Never submit passwords through Google Forms. This form was created inside of Thoughtworks. - Contact form owner
  - paragraph [ref=s1e217]:
    - text: Does this form look suspicious?
    - link "Report" [ref=s1e218]:
      - /url: reportabuse
  - link "Google Forms" [ref=s1e220]:
    - /url: //www.google.com/forms/about/?utm_source=product&utm_medium=forms_logo&utm_campaign=forms
    - img "Google" [ref=s1e221]
    - text: Forms
  - button "help and feedback" [ref=s1e227]
  - document [ref=s1e233]
   
   */
  generateHierarchy() {
    // Reset state
    this.elementMap.clear();
    this.refCounter = 1;

    const pageTitle = document.title || "Untitled Page";
    const hierarchy = [];

    // Start with document element
    const documentRef = this.generateRef();
    this.elementMap.set(documentRef, document.documentElement);

    hierarchy.push(`- Page Title: ${pageTitle}`);
    hierarchy.push(`- Page Snapshot`);
    hierarchy.push("```yaml");
    hierarchy.push(`- document [ref=${documentRef}]:`);

    // Process body content
    const bodyContent = this.processElement(document.body, 1);
    hierarchy.push(...bodyContent);

    hierarchy.push("```");

    return hierarchy.join("\n");
  }

  processElement(element, indentLevel) {
    const result = [];
    const indent = "  ".repeat(indentLevel);

    // Skip script, style, and hidden elements
    if (this.shouldSkipElement(element)) {
      return result;
    }

    // Process child nodes
    for (const node of element.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const elementInfo = this.getElementInfo(node);
        if (elementInfo) {
          result.push(`${indent}- ${elementInfo}`);

          // Add URL for links
          if (node.tagName.toLowerCase() === "a" && node.href) {
            result.push(`${indent}  - /url: ${node.href}`);
          }

          // Process children recursively
          const children = this.processElement(node, indentLevel + 1);
          result.push(...children);
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        const text = this.getCleanText(node);
        if (text) {
          result.push(`${indent}- text: ${text}`);
        }
      }
    }

    return result;
  }

  getElementInfo(element) {
    const tagName = element.tagName.toLowerCase();
    const isInteractive = this.isInteractiveElement(element);
    const isSemantic = this.semanticElements.has(tagName);

    if (!isInteractive && !isSemantic && !this.hasImportantContent(element)) {
      return null;
    }

    let elementType = this.getElementType(element);
    let attributes = [];
    let ref = null;

    // Generate reference for interactive elements
    if (isInteractive || this.needsRef(element)) {
      ref = this.generateRef();
      this.elementMap.set(ref, element);
      attributes.push(`ref=${ref}`);
    }

    // Add specific attributes based on element type
    attributes.push(...this.getElementAttributes(element));

    // Format element description
    let description = elementType;
    const text = this.getElementText(element);
    if (text) {
      description += ` "${text}"`;
    }

    // Add attributes in brackets
    if (attributes.length > 0) {
      description += ` [${attributes.join("] [")}]`;
    }

    return description;
  }

  getElementType(element) {
    const tagName = element.tagName.toLowerCase();
    const type = element.type;
    const role = element.getAttribute("role");

    // Check for role-based types first
    if (role === "checkbox") return "checkbox";
    if (role === "button") return "button";
    if (role === "listbox") return "listbox";
    if (role === "option") return "option";
    if (role === "heading") return "heading";
    if (role === "list") return "list";
    if (role === "listitem") return "listitem";

    switch (tagName) {
      case "input":
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        if (type === "submit") return "button";
        return "textbox";
      case "select":
        return "listbox";
      case "option":
        return "option";
      case "textarea":
        return "textbox";
      case "button":
        return "button";
      case "a":
        return "link";
      case "img":
        return "img";
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return "heading";
      case "ul":
      case "ol":
        return "list";
      case "li":
        return "listitem";
      case "p":
        return "paragraph";
      default:
        return tagName;
    }
  }

  getElementAttributes(element) {
    const attributes = [];
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute("role");

    // Heading level - check both tag name and aria-level
    if (tagName.match(/^h[1-6]$/)) {
      attributes.push(`level=${tagName.charAt(1)}`);
    } else if (role === "heading") {
      const ariaLevel = element.getAttribute("aria-level");
      if (ariaLevel) {
        attributes.push(`level=${ariaLevel}`);
      }
    }

    // Selected state for options
    if (
      (tagName === "option" && element.selected) ||
      (role === "option" && element.getAttribute("aria-selected") === "true")
    ) {
      attributes.push("selected");
    }

    // Checked state for checkboxes/radios
    if (
      (element.type === "checkbox" || element.type === "radio") &&
      element.checked
    ) {
      attributes.push("checked");
    } else if (
      role === "checkbox" &&
      element.getAttribute("aria-checked") === "true"
    ) {
      attributes.push("checked");
    }

    // Required state
    if (element.required) {
      attributes.push("required");
    }

    return attributes;
  }

  getElementText(element) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === "img") {
      return element.alt || element.title || "";
    }

    if (tagName === "input") {
      return (
        element.placeholder ||
        element.value ||
        element.getAttribute("aria-label") ||
        ""
      );
    }

    if (tagName === "select") {
      return element.getAttribute("aria-label") || "";
    }

    // Get direct text content, not from descendants
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }

    return text.trim();
  }

  getAdditionalContent(element) {
    return null;
  }

  getCleanText(textNode) {
    return textNode.textContent.trim().replace(/\s+/g, " ");
  }

  isInteractiveElement(element) {
    const tagName = element.tagName.toLowerCase();
    return (
      this.interactiveElements.has(tagName) ||
      element.onclick ||
      element.getAttribute("role") === "button" ||
      element.tabIndex >= 0
    );
  }

  needsRef(element) {
    const tagName = element.tagName.toLowerCase();
    return (
      ["ul", "ol", "li", "p", "div"].includes(tagName) &&
      (element.id || element.className || this.hasInteractiveChildren(element))
    );
  }

  hasInteractiveChildren(element) {
    return (
      Array.from(element.querySelectorAll("button, input, select, textarea, a"))
        .length > 0
    );
  }

  hasImportantContent(element) {
    // Check if element has important semantic meaning or content
    return (
      element.children.length > 0 ||
      this.getCleanText(element) ||
      element.querySelector("img, button, input, select, textarea, a")
    );
  }

  shouldSkipElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;

    const tagName = element.tagName.toLowerCase();
    const skipTags = ["script", "style", "meta", "link", "head"];

    if (skipTags.includes(tagName)) return true;

    // Skip hidden elements
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return true;

    return false;
  }

  generateRef() {
    return `s1e${this.refCounter++}`;
  }
}

// Export for both Node.js and browser environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = DOMHierarchy;
} else if (typeof window !== "undefined") {
  window.DOMHierarchy = DOMHierarchy;
}

// ES module export
export default DOMHierarchy;
