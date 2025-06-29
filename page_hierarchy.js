class PageHierarchy {
  constructor(page, elementMap, logger) {
    this.page = page;
    this.elementMap = elementMap;
    this.logger = logger;
  }

  async clearWindowObjectData() {
    try {
      await this.page.evaluate(() => {
        // Clear window object data
        window.mcpElementMap = null;
        window.mcpDomHierarchy = null;
        window.mcpHierarchySummary = null;
        window.mcpLastUpdated = null;
        window.getMcpElement = null;
        window.listMcpRefs = null;
        window.getMcpElementByAttr = null;
        window.listMcpElements = null;

        // Remove all MCP-specific attributes from elements
        const mcpElements = document.querySelectorAll("[data-mcp-ref]");
        mcpElements.forEach((el) => {
          // Remove all attributes that start with 'data-mcp-ref'
          const attributes = Array.from(el.attributes);
          attributes.forEach((attr) => {
            if (attr.name.startsWith("data-mcp-ref")) {
              el.removeAttribute(attr.name);
            }
          });
        });

        // Also use a more comprehensive selector to catch all variants
        const allMcpElements = document.querySelectorAll("*");
        allMcpElements.forEach((el) => {
          const attributes = Array.from(el.attributes);
          attributes.forEach((attr) => {
            if (attr.name.startsWith("data-mcp-ref-")) {
              el.removeAttribute(attr.name);
            }
          });
        });

        console.log(
          "MCP: Cleared window object data and removed MCP attributes"
        );
      });
    } catch (error) {
      this.logger.debug(`Could not clear window object: ${error.message}`);
    }
  }

  async safelyGetPageHierarchy() {
    try {
      return await this.summarizePageHierarchy();
    } catch (error) {
      if (
        error.message.includes("detached") ||
        error.message.includes("Execution context")
      ) {
        this.logger.warning(
          `Page context detached, returning minimal info: ${error.message}`
        );
        return `Page state changed. Current URL: ${this.page.url()}\n\nTo see updated element references, please use web_navigate to refresh the page hierarchy.`;
      }
      throw error;
    }
  }

  async summarizePageHierarchy() {
    const hierarchy = await this.page.evaluate(() => {
      let refCounter = 1;
      const elementMap = new Map();
      const result = [];

      // Helper function to check if element is visible
      function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          element.offsetWidth > 0 &&
          element.offsetHeight > 0
        );
      }

      // Helper function to check if element is interactive
      function isInteractive(element) {
        const interactiveTags = [
          "button",
          "a",
          "input",
          "textarea",
          "select",
          "option",
        ];
        const interactiveRoles = [
          "button",
          "link",
          "textbox",
          "checkbox",
          "radio",
          "listbox",
          "option",
          "menuitem",
        ];

        // Check by tag name
        if (interactiveTags.includes(element.tagName.toLowerCase())) {
          return true;
        }

        // Check by role
        const role = element.getAttribute("role");
        if (role && interactiveRoles.includes(role.toLowerCase())) {
          return true;
        }

        // Check for click handlers or tabindex
        if (element.onclick || element.getAttribute("tabindex") === "0") {
          return true;
        }

        return false;
      }

      // Helper function to check if element should be included
      function shouldIncludeElement(element) {
        if (!isVisible(element)) return false;

        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute("role");

        // Always include interactive elements
        if (isInteractive(element)) return true;

        // Include elements with specific roles
        if (role === "list" || role === "listitem") return true;

        // Include semantic/structural elements (including label)
        const semanticTags = [
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "ul",
          "ol",
          "li",
          "img",
          "form",
          "p",
          "label",
        ];
        if (semanticTags.includes(tagName)) return true;

        // Include elements with meaningful text content
        const textContent = element.textContent?.trim();
        if (
          textContent &&
          textContent.length > 0 &&
          element.children.length === 0
        ) {
          return true;
        }

        return false;
      }

      // Helper function to get element type name
      function getElementType(element) {
        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute("role");
        const type = element.getAttribute("type");

        // Handle input types specifically - keep as "input"
        if (tagName === "input") {
          return "input";
        }

        // Handle by role
        if (role) {
          if (role === "button") return "button";
          if (role === "link") return "link";
          if (role === "textbox") return "textbox";
          if (role === "checkbox") return "checkbox";
          if (role === "radio") return "radio";
          if (role === "listbox") return "listbox";
          if (role === "option") return "option";
          if (role === "menuitem") return "menuitem";
          if (role === "list") return "list";
          if (role === "listitem") return "listitem";
        }

        // Handle by tag name
        if (tagName === "button") return "button";
        if (tagName === "a") return "link";
        if (tagName === "textarea") return "textbox";
        if (tagName === "select") return "listbox";
        if (tagName === "option") return "option";
        if (tagName === "img") return "img";
        if (tagName === "ul" || tagName === "ol") return "list";
        if (tagName === "li") return "listitem";
        if (tagName === "p") return "paragraph";
        if (tagName.match(/^h[1-6]$/)) return "heading";
        if (tagName === "form") return "form";
        if (tagName === "label") return "label";

        return tagName;
      }

      // Helper function to get element description
      function getElementDescription(element) {
        const tagName = element.tagName.toLowerCase();
        let description = "";

        // Get text content
        let text = "";
        if (element.children.length === 0) {
          text = element.textContent?.trim() || "";
        } else {
          // For elements with children, get direct text nodes
          const textNodes = [];
          for (let node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const nodeText = node.textContent?.trim();
              if (nodeText) textNodes.push(nodeText);
            }
          }
          text = textNodes.join(" ");
        }

        // Get meaningful attributes
        const alt = element.getAttribute("alt");
        const title = element.getAttribute("title");
        const placeholder = element.getAttribute("placeholder");
        const ariaLabel = element.getAttribute("aria-label");
        const value = element.value;

        // Determine the best label
        let label = ariaLabel || alt || title || placeholder || text || "";

        if (label && label.length > 0) {
          description += `"${label}"`;
        }

        return description;
      }

      // Helper function to get metadata
      function getMetadata(element) {
        const metadata = [];
        const tagName = element.tagName.toLowerCase();

        // Heading level
        if (tagName.match(/^h[1-6]$/)) {
          const level = tagName.charAt(1);
          metadata.push(`level=${level}`);
        }

        // Selected state for options
        if (tagName === "option" && element.selected) {
          metadata.push("selected");
        }

        // Checked state for checkboxes/radio
        if (
          tagName === "input" &&
          (element.type === "checkbox" || element.type === "radio") &&
          element.checked
        ) {
          metadata.push("checked");
        }

        return metadata;
      }

      // Helper function to get URL
      function getUrl(element) {
        const href = element.getAttribute("href");
        if (href) {
          return href;
        }
        return null;
      }

      // Helper function to assign reference and create selector
      function assignRef(element) {
        const ref = `s1e${refCounter++}`;
        const attr = `data-mcp-ref-${ref.replace("s1e", "")}`;
        element.setAttribute(attr, ref);
        elementMap.set(ref, element);
        return ref;
      }

      // Helper function to process element
      function processElement(element, depth = 0) {
        if (!shouldIncludeElement(element)) {
          // Still process children for elements we don't include
          for (let child of element.children) {
            processElement(child, depth);
          }
          return;
        }

        const ref = assignRef(element);
        const elementType = getElementType(element);
        const description = getElementDescription(element);
        const metadata = getMetadata(element);
        const url = getUrl(element);

        // Build the line
        const indent = "  ".repeat(depth);
        let line = `${indent}- ${elementType}`;

        if (description) {
          line += ` ${description}`;
        }

        // Add metadata
        if (metadata.length > 0) {
          line += ` [${metadata.join("] [")}]`;
        }

        line += ` [ref=${ref}]`;

        // Add colon for text content if it follows
        const tagName = element.tagName.toLowerCase();
        if (tagName.match(/^h[1-6]$/) && description) {
          line += ":";
        }

        result.push(line);

        // Add URL if present
        if (url) {
          result.push(`${indent}  - /url: ${url}`);
        }

        // Add standalone text content for elements with children
        if (element.children.length > 0) {
          const textNodes = [];
          for (let node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const nodeText = node.textContent?.trim();
              if (nodeText && nodeText.length > 20) {
                // Only significant text
                textNodes.push(nodeText);
              }
            }
          }
          if (textNodes.length > 0) {
            result.push(`${indent}  - text: ${textNodes.join(" ")}`);
          }
        }

        // Process children
        for (let child of element.children) {
          processElement(child, depth + 1);
        }
      }

      // Start processing from document
      result.push("- Page Snapshot");

      // Add document wrapper
      const documentRef = assignRef(document.documentElement);
      result.push(`- document [ref=${documentRef}]:`);

      // Process body content
      processElement(document.body, 1);

      return {
        hierarchy: result.join("\n"),
        elementMap: Object.fromEntries(
          Array.from(elementMap.entries()).map(([ref, element]) => [
            ref,
            `[data-mcp-ref-${ref.replace("s1e", "")}]`,
          ])
        ),
      };
    });

    // Store the hierarchy and element map
    this.elementMap.clear();
    for (const [ref, selector] of Object.entries(hierarchy.elementMap)) {
      this.elementMap.set(ref, selector);
    }

    // Store in window object for debugging
    await this.page.evaluate((hierarchyData) => {
      window.mcpElementMap = hierarchyData.elementMap;
      window.mcpHierarchySummary = hierarchyData.hierarchy;
      window.mcpLastUpdated = new Date().toISOString();

      // Helper functions for debugging
      window.getMcpElement = (ref) => {
        const selector = window.mcpElementMap[ref];
        return selector ? document.querySelector(selector) : null;
      };

      window.getMcpElementByAttr = (attrValue) => {
        return document.querySelector(`[data-mcp-ref-${attrValue}]`);
      };

      window.listMcpRefs = () => {
        return Object.keys(window.mcpElementMap);
      };

      window.listMcpElements = () => {
        const elements = {};
        for (const [ref, selector] of Object.entries(window.mcpElementMap)) {
          const element = document.querySelector(selector);
          if (element) {
            elements[ref] = {
              tagName: element.tagName,
              textContent: element.textContent?.trim().substring(0, 50),
              selector: selector,
            };
          }
        }
        return elements;
      };

      console.log(
        "MCP: Page hierarchy updated. Use window.listMcpRefs() to see all references."
      );
    }, hierarchy);

    this.logger.debug(
      `Generated page hierarchy with ${
        Object.keys(hierarchy.elementMap).length
      } elements`
    );

    return hierarchy.hierarchy;
  }
}

export default PageHierarchy;
