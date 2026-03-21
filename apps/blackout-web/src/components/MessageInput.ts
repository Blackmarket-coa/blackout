interface MessageInputOptions {
  disabled: boolean;
  compactMode: boolean;
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
  compactMode,
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
    composerRepliesEnabled ? '<option value="reply">Reply template</option>' : "",
    composerEditsEnabled ? '<option value="edit">Edit note</option>' : "",
    composerRedactionsEnabled ? '<option value="redact">Redact placeholder</option>' : "",
    mediaCodeBlocksEnabled ? '<option value="code">Code snippet</option>' : "",
    mediaSpoilersEnabled ? '<option value="spoiler">Spoiler wrapper</option>' : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <form id="message-form" class="chat-input">
      ${
        richEditingEnabled
          ? `
        <div class="composer-toolbar ${compactMode ? "composer-toolbar--compact" : ""}" data-testid="composer-toolbar">
          <button type="button" data-action="composer-format-bold" title="Bold" aria-label="Format bold" ${disabled ? "disabled" : ""}><span aria-hidden="true">𝐁</span><span>Bold</span></button>
          <button type="button" data-action="composer-format-italic" title="Italic" aria-label="Format italic" ${disabled ? "disabled" : ""}><span aria-hidden="true">𝑰</span><span>Italic</span></button>
          <button type="button" data-action="composer-insert-emoji" title="Insert emoji" aria-label="Insert emoji" ${disabled ? "disabled" : ""}><span aria-hidden="true">😊</span><span>Emoji</span></button>
          ${stegoEnabled ? `<button type="button" data-action="composer-insert-stego" data-testid="composer-stego-button" title="Insert steganography snippet" aria-label="Insert steganography snippet" ${disabled ? "disabled" : ""}><span aria-hidden="true">🕶️</span><span>Stego</span></button>` : ""}
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
          <button type="button" class="ghost-btn composer-help-btn" data-action="composer-help" title="Message composer help" aria-label="Message composer help">ⓘ</button>
        </div>
      `
          : ""
      }
      <textarea name="message" rows="2" aria-describedby="composer-hint" placeholder="Write a message…" ${disabled ? "disabled" : ""}></textarea>
      <p id="composer-hint" class="meta composer-hint">Enter to send · Shift+Enter for a new line.</p>
      ${typingIndicatorsEnabled && showTypingIndicator ? '<p class="meta" data-testid="typing-indicator">You are typing…</p>' : ""}
      <button type="submit" ${disabled ? "disabled" : ""}>Send message</button>
    </form>
  `;
}
