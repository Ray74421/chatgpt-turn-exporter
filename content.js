(() => {
  "use strict";

  const EXPORT_BUTTON_CLASS = "chatgpt-turn-export-button";
  const MESSAGE_SELECTOR = "[data-message-author-role]";

  /**
   * Extracts readable text from a message while excluding UI elements
   * injected by this extension.
   *
   * @param {HTMLElement} messageElement
   * @returns {string}
   */
 

  /**
   * Finds the nearest user message preceding an assistant message.
   *
   * @param {HTMLElement} assistantMessage
   * @returns {HTMLElement | null}
   */
  function findPreviousUserMessage(assistantMessage) {
    const messages = Array.from(
      document.querySelectorAll(MESSAGE_SELECTOR)
    ).filter((element) => element instanceof HTMLElement);

    const assistantIndex = messages.indexOf(assistantMessage);

    if (assistantIndex === -1) {
      return null;
    }

    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index];

      if (
        candidate.getAttribute("data-message-author-role") === "user"
      ) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Converts a string into a filesystem-safe filename.
   *
   * @param {string} text
   * @returns {string}
   */
  function sanitizeFilename(text) {
    const sanitized = text
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);

    return sanitized || "chatgpt-turn";
  }

  /**
   * Creates a Markdown document from one user/assistant turn.
   *
   * @param {string} question
   * @param {string} answer
   * @returns {string}
   */
  function createMarkdown(question, answer) {
    const exportedAt = new Date().toLocaleString();

    return [
      "# ChatGPT Conversation",
      "",
      `> Exported: ${exportedAt}`,
      "",
      "## Question",
      "",
      question,
      "",
      "## Answer",
      "",
      answer,
      ""
    ].join("\n");
  }

  /**
   * Downloads text content as a UTF-8 Markdown file.
   *
   * @param {string} content
   * @param {string} filename
   */
  function downloadMarkdown(content, filename) {
    const blob = new Blob([content], {
      type: "text/markdown;charset=utf-8"
    });

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    // Release the temporary in-memory URL.
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  /**
   * Handles exporting a single ChatGPT turn.
   *
   * @param {HTMLElement} assistantMessage
   */
  function handleExport(assistantMessage) {
    try {
      const userMessage = findPreviousUserMessage(assistantMessage);

      if (!userMessage) {
        throw new Error(
          "Could not find the user message corresponding to this response."
        );
      }

      const question = ChatGPTMarkdown.fromMessageElement(
  userMessage,
  EXPORT_BUTTON_CLASS
);

const answer = ChatGPTMarkdown.fromMessageElement(
  assistantMessage,
  EXPORT_BUTTON_CLASS
);

      if (!question) {
        throw new Error("The user message is empty.");
      }

      if (!answer) {
        throw new Error("The assistant response is empty.");
      }

      const markdown = createMarkdown(question, answer);

      const filenameBase = sanitizeFilename(question);
      const filename = `${filenameBase}.md`;

      downloadMarkdown(markdown, filename);

      console.log("Exported ChatGPT turn:", {
        question,
        answer,
        filename
      });
    } catch (error) {
      console.error("Failed to export ChatGPT turn:", error);

      window.alert(
        `Failed to export this turn.\n\n${error.message}`
      );
    }
  }

  /**
   * Adds an Export button to one assistant message.
   *
   * @param {HTMLElement} messageElement
   */
  function addExportButton(messageElement) {
    const existingButton = messageElement.querySelector(
      `.${EXPORT_BUTTON_CLASS}`
    );

    if (existingButton) {
      return;
    }

    const button = document.createElement("button");

    button.type = "button";
    button.className = EXPORT_BUTTON_CLASS;
    button.textContent = "Export";

    Object.assign(button.style, {
      marginTop: "8px",
      padding: "4px 10px",
      border: "1px solid #aaa",
      borderRadius: "6px",
      background: "transparent",
      cursor: "pointer",
      fontSize: "12px"
    });

    button.addEventListener("click", () => {
      handleExport(messageElement);
    });

    messageElement.appendChild(button);
  }

  /**
   * Finds all currently rendered assistant messages.
   */
  function scanMessages() {
    const assistantMessages = document.querySelectorAll(
      '[data-message-author-role="assistant"]'
    );

    assistantMessages.forEach((messageElement) => {
      if (messageElement instanceof HTMLElement) {
        addExportButton(messageElement);
      }
    });
  }

  /**
   * ChatGPT dynamically inserts messages without a full page reload,
   * so watch the page for newly rendered messages.
   */
  const observer = new MutationObserver(() => {
    scanMessages();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  scanMessages();
})();