interface MessageInputOptions {
  disabled: boolean;
  richEditingEnabled: boolean;
  stegoEnabled: boolean;
  composerRepliesEnabled: boolean;
  composerEditsEnabled: boolean;
  composerRedactionsEnabled: boolean;
  mediaCodeBlocksEnabled: boolean;
  mediaSpoilersEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  showTypingIndicator: boolean;
}

export function renderMessageInput({
  disabled,
  richEditingEnabled,
  stegoEnabled,
  composerRepliesEnabled,
  composerEditsEnabled,
  composerRedactionsEnabled,
  mediaCodeBlocksEnabled,
  mediaSpoilersEnabled,
  typingIndicatorsEnabled,
  showTypingIndicator,
}: MessageInputOptions): string {
  const advancedActions = [
    composerRepliesEnabled ? '<option value="reply">Reply snippet</option>' : "",
    composerEditsEnabled ? '<option value="edit">Edit marker</option>' : "",
    composerRedactionsEnabled ? '<option value="redact">Redaction marker</option>' : "",
    mediaCodeBlocksEnabled ? '<option value="code">Code block</option>' : "",
    mediaSpoilersEnabled ? '<option value="spoiler">Spoiler block</option>' : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <form id="message-form" class="chat-input">
      ${
        richEditingEnabled
          ? `
        <div class="composer-toolbar" data-testid="composer-toolbar">
          <button type="button" data-action="composer-format-bold" ${disabled ? "disabled" : ""}>Bold</button>
          <button type="button" data-action="composer-format-italic" ${disabled ? "disabled" : ""}>Italic</button>
          <button type="button" data-action="composer-insert-emoji" ${disabled ? "disabled" : ""}>😊</button>
          ${stegoEnabled ? `<button type="button" data-action="composer-insert-stego" data-testid="composer-stego-button" ${disabled ? "disabled" : ""}>Stego</button>` : ""}
          ${
            advancedActions
              ? `<label class="composer-overflow-label">More
                  <select data-action="composer-more-actions" data-testid="composer-more-actions" ${disabled ? "disabled" : ""}>
                    <option value="">Select…</option>
                    ${advancedActions}
                  </select>
                </label>`
              : ""
          }
        </div>
      `
          : ""
      }
      <textarea name="message" rows="2" placeholder="Message #channel (Enter to send, Shift+Enter for newline)" ${disabled ? "disabled" : ""}></textarea>
      ${typingIndicatorsEnabled && showTypingIndicator ? '<p class="meta" data-testid="typing-indicator">Typing…</p>' : ""}
      <button type="submit" ${disabled ? "disabled" : ""}>Send</button>
    </form>
  `;
}
