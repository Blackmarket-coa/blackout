interface MessageInputOptions {
  disabled: boolean;
  richEditingEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  showTypingIndicator: boolean;
}

export function renderMessageInput({
  disabled,
  richEditingEnabled,
  typingIndicatorsEnabled,
  showTypingIndicator,
}: MessageInputOptions): string {
  return `
    <form id="message-form" class="chat-input">
      ${
        richEditingEnabled
          ? `
        <div class="composer-toolbar" data-testid="composer-toolbar">
          <button type="button" data-action="composer-format-bold" ${disabled ? "disabled" : ""}>Bold</button>
          <button type="button" data-action="composer-format-italic" ${disabled ? "disabled" : ""}>Italic</button>
          <button type="button" data-action="composer-insert-emoji" ${disabled ? "disabled" : ""}>😊</button>
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
