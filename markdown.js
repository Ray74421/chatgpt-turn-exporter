"use strict";

/**
 * Utilities for converting rendered ChatGPT message DOM into Markdown.
 *
 * The converter intentionally focuses on semantic elements commonly
 * produced by ChatGPT: headings, paragraphs, emphasis, lists, links,
 * code blocks, tables, blockquotes, and KaTeX mathematics.
 */
const ChatGPTMarkdown = (() => {
  /**
   * Escapes Markdown-sensitive text inside table cells.
   *
   * @param {string} text
   * @returns {string}
   */
  function escapeTableCell(text) {
    return text
      .replace(/\|/g, "\\|")
      .replace(/\r?\n+/g, "<br>")
      .trim();
  }

  /**
   * Extracts the original TeX source embedded by KaTeX.
   *
   * @param {Element} element
   * @returns {string | null}
   */
  function getKatexSource(element) {
    const annotation = element.querySelector(
      'annotation[encoding="application/x-tex"]'
    );

    const tex = annotation?.textContent?.trim();

    return tex || null;
  }

  /**
   * Replaces rendered KaTeX elements with Markdown-compatible TeX.
   *
   * This must happen before generic DOM traversal because KaTeX contains
   * both visual HTML and MathML representations of the same expression.
   *
   * @param {HTMLElement} root
   */
  /**
 * Restores rendered mathematical expressions to Markdown/LaTeX.
 *
 * ChatGPT currently wraps rendered KaTeX expressions in elements such as:
 *
 *   <span
 *     role="math"
 *     aria-label="|E_n\rangle \to e^{-iE_nt/\hbar}|E_n\rangle"
 *   >
 *     <span class="katex-display">...</span>
 *   </span>
 *
 * The aria-label contains the original TeX source. We therefore prefer
 * this representation and fall back to KaTeX's MathML annotation format
 * for compatibility with other renderer versions.
 *
 * @param {HTMLElement} root
 */
function restoreMath(root) {
  restoreMathFromAriaLabels(root);
  restoreMathFromKatexAnnotations(root);
}

/**
 * Restores formulas from ChatGPT's role="math" wrappers.
 *
 * @param {HTMLElement} root
 */
function restoreMathFromAriaLabels(root) {
  const mathElements = Array.from(
    root.querySelectorAll('[role="math"][aria-label]')
  );

  for (const mathElement of mathElements) {
    const tex = mathElement.getAttribute("aria-label")?.trim();

    if (!tex) {
      continue;
    }

    /*
     * Display equations contain a .katex-display descendant.
     * Inline equations contain only the normal .katex renderer.
     */
    const isDisplayMath =
      Boolean(mathElement.querySelector(".katex-display")) ||
      mathElement.classList.contains("katex-display");

    const markdown = isDisplayMath
      ? `\n\n$$\n${tex}\n$$\n\n`
      : `$${tex}$`;

    mathElement.replaceWith(
      document.createTextNode(markdown)
    );
  }
}

/**
 * Fallback for conventional KaTeX HTML+MathML output.
 *
 * Some pages preserve the original TeX inside:
 *
 *   <annotation encoding="application/x-tex">
 *
 * ChatGPT currently appears to use aria-label instead, but retaining this
 * fallback makes the exporter more resilient to frontend changes.
 *
 * @param {HTMLElement} root
 */
function restoreMathFromKatexAnnotations(root) {
  const annotations = Array.from(
    root.querySelectorAll(
      'annotation[encoding="application/x-tex"]'
    )
  );

  const processed = new Set();

  for (const annotation of annotations) {
    const tex = annotation.textContent?.trim();

    if (!tex) {
      continue;
    }

    const displayWrapper = annotation.closest(".katex-display");
    const katexWrapper = annotation.closest(".katex");
    const mathElement = annotation.closest("math");

    const formulaElement =
      displayWrapper ??
      katexWrapper ??
      mathElement;

    if (!formulaElement || processed.has(formulaElement)) {
      continue;
    }

    processed.add(formulaElement);

    const isDisplayMath =
      Boolean(displayWrapper) ||
      mathElement?.getAttribute("display") === "block";

    const markdown = isDisplayMath
      ? `\n\n$$\n${tex}\n$$\n\n`
      : `$${tex}$`;

    formulaElement.replaceWith(
      document.createTextNode(markdown)
    );
  }
}

  /**
   * Determines the language identifier of a fenced code block.
   *
   * @param {HTMLElement} preElement
   * @returns {string}
   */
  function getCodeLanguage(preElement) {
    const codeElement = preElement.querySelector("code");

    if (!codeElement) {
      return "";
    }

    const languageClass = Array.from(codeElement.classList).find((className) =>
      className.startsWith("language-")
    );

    if (!languageClass) {
      return "";
    }

    return languageClass.slice("language-".length);
  }

  /**
   * Selects a safe fence length for a code block.
   *
   * @param {string} code
   * @returns {string}
   */
  function getCodeFence(code) {
    const matches = code.match(/`+/g) ?? [];
    const longestSequence = matches.reduce(
      (maximum, sequence) => Math.max(maximum, sequence.length),
      0
    );

    return "`".repeat(Math.max(3, longestSequence + 1));
  }

  /**
   * Converts an HTML table into a GitHub-Flavored Markdown table.
   *
   * @param {HTMLTableElement} table
   * @returns {string}
   */
  function convertTable(table) {
    const rows = Array.from(table.querySelectorAll("tr"))
      .map((row) =>
        Array.from(row.querySelectorAll(":scope > th, :scope > td"))
          .map((cell) => escapeTableCell(cell.innerText))
      )
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      return "";
    }

    const columnCount = Math.max(...rows.map((row) => row.length));

    const normalizeRow = (row) =>
      Array.from(
        { length: columnCount },
        (_, index) => row[index] ?? ""
      );

    const header = normalizeRow(rows[0]);
    const body = rows.slice(1).map(normalizeRow);

    const formatRow = (row) => `| ${row.join(" | ")} |`;

    return [
      "",
      formatRow(header),
      formatRow(header.map(() => "---")),
      ...body.map(formatRow),
      ""
    ].join("\n");
  }

  /**
   * Converts a list to Markdown.
   *
   * @param {HTMLElement} listElement
   * @param {number} depth
   * @returns {string}
   */
  function convertList(listElement, depth = 0) {
    const ordered = listElement.tagName === "OL";

    const items = Array.from(listElement.children).filter(
      (child) => child.tagName === "LI"
    );

    return items
      .map((item, index) => {
        const nestedLists = Array.from(item.children).filter(
          (child) => child.tagName === "UL" || child.tagName === "OL"
        );

        const clone = item.cloneNode(true);

        if (!(clone instanceof HTMLElement)) {
          return "";
        }

        clone.querySelectorAll(":scope > ul, :scope > ol").forEach(
          (nested) => nested.remove()
        );

        const content = convertChildren(clone)
          .trim()
          .replace(/\n{2,}/g, "\n");

        const marker = ordered ? `${index + 1}.` : "-";
        const indentation = "  ".repeat(depth);

        let markdown = `${indentation}${marker} ${content}`;

        for (const nestedList of nestedLists) {
          markdown += `\n${convertList(nestedList, depth + 1)}`;
        }

        return markdown;
      })
      .join("\n");
  }

  /**
   * Converts all children of a node to Markdown.
   *
   * @param {Node} node
   * @returns {string}
   */
  function convertChildren(node) {
    return Array.from(node.childNodes)
      .map((child) => convertNode(child))
      .join("");
  }

  /**
   * Recursively converts a DOM node to Markdown.
   *
   * @param {Node} node
   * @returns {string}
   */
  function convertNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }

    if (!(node instanceof HTMLElement)) {
      return "";
    }

    const tagName = node.tagName.toLowerCase();

    switch (tagName) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = Number(tagName.slice(1));

        return `\n\n${"#".repeat(level)} ${convertChildren(node).trim()}\n\n`;
      }

      case "p":
        return `\n\n${convertChildren(node).trim()}\n\n`;

      case "strong":
      case "b":
        return `**${convertChildren(node)}**`;

      case "em":
      case "i":
        return `*${convertChildren(node)}*`;

      case "del":
      case "s":
        return `~~${convertChildren(node)}~~`;

      case "code":
        // <code> inside <pre> is handled by the <pre> case.
        if (node.parentElement?.tagName === "PRE") {
          return node.textContent ?? "";
        }

        return `\`${node.textContent ?? ""}\``;

      case "pre": {
        const code =
          node.querySelector("code")?.textContent ??
          node.textContent ??
          "";

        const language = getCodeLanguage(node);
        const fence = getCodeFence(code);

        return [
          "",
          `${fence}${language}`,
          code.replace(/\n$/, ""),
          fence,
          ""
        ].join("\n");
      }

      case "blockquote": {
        const content = convertChildren(node).trim();

        const quoted = content
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");

        return `\n\n${quoted}\n\n`;
      }

      case "ul":
      case "ol":
        return `\n${convertList(node)}\n`;

      case "li":
        return convertChildren(node);

      case "a": {
        const text = convertChildren(node).trim();
        const href = node.getAttribute("href");

        if (!href) {
          return text;
        }

        return `[${text || href}](${href})`;
      }

      case "table":
        return convertTable(node);

      case "br":
        return "\n";

      case "hr":
        return "\n\n---\n\n";

      case "img": {
        const alt = node.getAttribute("alt") ?? "";
        const src = node.getAttribute("src");

        return src ? `![${alt}](${src})` : "";
      }

      case "button":
      case "svg":
        return "";

      default:
        return convertChildren(node);
    }
  }

  /**
   * Normalizes excessive whitespace introduced during DOM conversion.
   *
   * @param {string} markdown
   * @returns {string}
   */
  function normalizeMarkdown(markdown) {
    return markdown
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Converts a ChatGPT message element into Markdown.
   *
   * @param {HTMLElement} messageElement
   * @param {string} exportButtonClass
   * @returns {string}
   */
  function fromMessageElement(messageElement, exportButtonClass) {
    const clone = messageElement.cloneNode(true);

    if (!(clone instanceof HTMLElement)) {
      return "";
    }

    clone
      .querySelectorAll(`.${exportButtonClass}`)
      .forEach((element) => element.remove());

    // Remove interface controls that are not part of the response.
    clone.querySelectorAll("button, svg").forEach((element) => {
      element.remove();
    });

    restoreMath(clone);

    // Assistant responses normally have a semantic Markdown content root.
    // Fall back to the complete message for user messages or future UI changes.
    const contentRoot =
      clone.querySelector(".markdown") ??
      clone;

    return normalizeMarkdown(convertChildren(contentRoot));
  }

  return {
    fromMessageElement
  };
})();