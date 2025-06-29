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
    try {
      // Clear previous element map
      this.elementMap.clear();

      // Check if page is still valid and not detached
      try {
        await this.page.evaluate(() => document.readyState);
      } catch (error) {
        if (error.message.includes("detached")) {
          throw new Error(
            "Page context is detached. Please navigate to a page first."
          );
        }
        throw error;
      }

      // Inject the DOMHierarchy class into the page and run it
      const hierarchyData = await this.page.evaluate(() => {
        // Define the DOMHierarchy class directly in the page context
        // (We can't import modules in page.evaluate, so we inline it)
        class DOMHierarchy {
          constructor() {
            this.elementMap = new Map();
            this.refCounter = 1;
          }

          generateSelector(el, ref) {
            // First, add a unique attribute to the element for reliable selection
            const uniqueAttr = `data-mcp-ref-${ref}`;
            el.setAttribute(uniqueAttr, "true");

            // Use the unique attribute as the primary selector
            return `[${uniqueAttr}]`;
          }

          getDirectTextContent(el) {
            let text = "";
            for (let node of el.childNodes) {
              if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent.trim() + " ";
              }
            }
            return text.replace(/\s+/g, " ").trim();
          }

          isInteractiveElement(el) {
            const tagName = el.tagName.toLowerCase();
            const type = el.getAttribute("type");
            const role = el.getAttribute("role");

            if (
              ["button", "a", "input", "textarea", "select", "option"].includes(
                tagName
              )
            ) {
              return true;
            }

            if (
              [
                "button",
                "link",
                "textbox",
                "checkbox",
                "radio",
                "listbox",
                "option",
                "menuitem",
              ].includes(role)
            ) {
              return true;
            }

            if (
              el.hasAttribute("onclick") ||
              el.getAttribute("tabindex") === "0"
            ) {
              return true;
            }

            return false;
          }

          isVisible(el) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0" &&
              rect.width > 0 &&
              rect.height > 0 &&
              el.getAttribute("aria-hidden") !== "true" &&
              !el.hidden
            );
          }

          getElementRole(el) {
            const tagName = el.tagName.toLowerCase();
            const role = el.getAttribute("role");
            const type = el.getAttribute("type");

            if (role) return role;

            const roleMap = {
              h1: "heading",
              h2: "heading",
              h3: "heading",
              h4: "heading",
              h5: "heading",
              h6: "heading",
              button: "button",
              a: "link",
              input:
                type === "checkbox"
                  ? "checkbox"
                  : type === "radio"
                  ? "radio"
                  : "textbox",
              textarea: "textbox",
              select: "listbox",
              option: "option",
              ul: "list",
              ol: "list",
              li: "listitem",
              form: "form",
              img: "img",
              p: "paragraph",
            };

            return roleMap[tagName] || tagName;
          }

          getElementDescription(el) {
            const role = this.getElementRole(el);
            const ariaLabel = el.getAttribute("aria-label");
            const title = el.getAttribute("title");
            const alt = el.getAttribute("alt");
            const placeholder = el.getAttribute("placeholder");
            const value = el.value;
            const href = el.getAttribute("href");
            const type = el.getAttribute("type");
            const name = el.getAttribute("name");
            const id = el.id;
            const ariaLevel = el.getAttribute("aria-level");
            const checked = el.checked;
            const selected = el.selected;
            const disabled = el.disabled;
            const required = el.required;

            let description = role;
            let displayText = "";
            let attributes = [];

            const directText = this.getDirectTextContent(el);
            const allText = el.textContent?.trim().replace(/\s+/g, " ") || "";

            if (ariaLabel) {
              displayText = ariaLabel;
            } else if (alt) {
              displayText = alt;
            } else if (title) {
              displayText = title;
            } else if (placeholder) {
              displayText = placeholder;
            } else if (directText && directText.length < 100) {
              displayText = directText;
            } else if (allText && allText.length < 100) {
              displayText = allText;
            }

            if (displayText) {
              description += ` "${displayText}"`;
            }

            if (href) {
              attributes.push(`/url: ${href}`);
            }

            if (
              type &&
              ["email", "password", "search", "tel", "url", "number"].includes(
                type
              )
            ) {
              attributes.push(`type="${type}"`);
            }

            if (name) attributes.push(`name="${name}"`);
            if (id) attributes.push(`id="${id}"`);
            if (value && value.length < 50) attributes.push(`value="${value}"`);
            if (ariaLevel) attributes.push(`level=${ariaLevel}`);

            if (checked) attributes.push("checked");
            if (selected) attributes.push("selected");
            if (disabled) attributes.push("disabled");
            if (required) attributes.push("required");

            if (attributes.length > 0) {
              description += ` [${attributes.join("] [")}]`;
            }

            return description;
          }

          shouldIncludeElement(el) {
            const tagName = el.tagName.toLowerCase();

            if (this.isInteractiveElement(el)) return true;

            const semanticElements = [
              "header",
              "nav",
              "main",
              "section",
              "article",
              "aside",
              "footer",
              "h1",
              "h2",
              "h3",
              "h4",
              "h5",
              "h6",
              "form",
              "fieldset",
              "legend",
              "ul",
              "ol",
              "li",
              "dl",
              "dt",
              "dd",
              "table",
              "thead",
              "tbody",
              "tfoot",
              "tr",
              "th",
              "td",
              "p",
              "blockquote",
              "pre",
              "code",
              "img",
              "figure",
              "figcaption",
              "details",
              "summary",
            ];

            if (semanticElements.includes(tagName)) return true;

            const role = el.getAttribute("role");
            const importantRoles = [
              "banner",
              "navigation",
              "main",
              "complementary",
              "contentinfo",
              "list",
              "listitem",
              "heading",
              "button",
              "link",
              "textbox",
              "checkbox",
              "radio",
              "listbox",
              "option",
              "menuitem",
              "dialog",
            ];

            if (importantRoles.includes(role)) return true;

            if (tagName === "div") {
              const hasInteractiveChild = el.querySelector(
                'button, a, input, textarea, select, [role="button"], [role="link"], [role="textbox"], [tabindex="0"]'
              );
              const hasTextContent = this.getDirectTextContent(el).length > 0;
              return hasInteractiveChild || hasTextContent;
            }

            return false;
          }

          processElement(el, depth = 0) {
            if (!this.isVisible(el) || depth > 10) return null;

            const shouldInclude = this.shouldIncludeElement(el);
            const isInteractive = this.isInteractiveElement(el);

            let elementInfo = null;

            if (shouldInclude || isInteractive) {
              const description = this.getElementDescription(el);
              let ref = null;

              if (isInteractive) {
                const refNumber = this.refCounter++;
                ref = `ref=${refNumber}`;
                const selector = this.generateSelector(el, refNumber);
                this.elementMap.set(refNumber.toString(), selector);
              }

              elementInfo = {
                description: ref ? `${description} [${ref}]` : description,
                children: [],
                isInteractive,
              };
            }

            const children = [];
            for (const child of el.children) {
              const childInfo = this.processElement(child, depth + 1);
              if (childInfo) {
                children.push(childInfo);
              }
            }

            if (elementInfo) {
              elementInfo.children = children;
              return elementInfo;
            }

            return children.length === 1
              ? children[0]
              : children.length > 1
              ? { description: "container", children }
              : null;
          }

          formatHierarchy(element, indent = 0) {
            if (!element) return "";

            const indentStr = "  ".repeat(indent);
            let result = `${indentStr}- ${element.description}`;

            if (element.children && element.children.length > 0) {
              result += ":\n";
              for (const child of element.children) {
                const childResult = this.formatHierarchy(child, indent + 1);
                if (childResult.trim()) {
                  result += childResult + "\n";
                }
              }
              result = result.replace(/\n$/, "");
            }

            return result;
          }

          generateHierarchy() {
            this.elementMap.clear();
            this.refCounter = 1;

            const body = document.body;
            const hierarchy = this.processElement(body, 0);

            const pageTitle = document.title;
            const currentUrl = window.location.href;

            const formattedHierarchy = this.formatHierarchy(hierarchy);

            return {
              summary: `- Page URL: ${currentUrl}
- Page Title: ${pageTitle}
- Page Snapshot
\`\`\`yaml
${formattedHierarchy}
\`\`\``,
              elementMap: Array.from(this.elementMap.entries()),
              hierarchy: hierarchy,
            };
          }
        }

        // Create instance and generate hierarchy
        const domHierarchy = new DOMHierarchy();
        return domHierarchy.generateHierarchy();
      });

      // Store the element map for later use by action methods
      hierarchyData.elementMap.forEach(([ref, selector]) => {
        this.elementMap.set(ref.toString(), selector);
      });

      // Save elementMap and hierarchy to window object for debugging/persistence
      try {
        await this.page.evaluate((data) => {
          window.mcpElementMap = new Map(data.elementMap);
          window.mcpDomHierarchy = data.hierarchy;
          window.mcpHierarchySummary = data.summary;
          window.mcpLastUpdated = new Date().toISOString();

          // Also create a helper function to get element by ref
          window.getMcpElement = function (ref) {
            const selector = window.mcpElementMap.get(ref.toString());
            if (selector) {
              return document.querySelector(selector);
            }
            return null;
          };

          // Helper to get element directly by unique attribute
          window.getMcpElementByAttr = function (ref) {
            return document.querySelector(`[data-mcp-ref-${ref}]`);
          };

          // Helper to list all available refs
          window.listMcpRefs = function () {
            return Array.from(window.mcpElementMap.keys());
          };

          // Helper to list all elements with MCP attributes
          window.listMcpElements = function () {
            const elements = document.querySelectorAll("[data-mcp-ref-]");
            return Array.from(elements).map((el) => {
              const attr = Array.from(el.attributes).find((attr) =>
                attr.name.startsWith("data-mcp-ref-")
              );
              const ref = attr ? attr.name.replace("data-mcp-ref-", "") : null;
              return {
                ref: ref,
                element: el,
                tagName: el.tagName,
                textContent: el.textContent?.trim().substring(0, 50) || "",
                selector: `[${attr.name}]`,
              };
            });
          };

          console.log("MCP: Saved elementMap and hierarchy to window object");
          console.log(
            "MCP: Available refs:",
            Array.from(window.mcpElementMap.keys())
          );
          console.log(
            "MCP: Elements are now tagged with unique data-mcp-ref-* attributes for reliable selection"
          );
          console.log(
            "MCP: Use window.listMcpElements() to see detailed element information"
          );
        }, hierarchyData);
      } catch (error) {
        this.logger.debug(`Could not save to window object: ${error.message}`);
      }

      return hierarchyData.summary;
    } catch (error) {
      this.logger.error(`Error generating page hierarchy: ${error.message}`);
      return "Error: Could not generate page hierarchy";
    }
  }
}

export default PageHierarchy;
