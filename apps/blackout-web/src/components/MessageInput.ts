export function renderMessageInput(disabled: boolean): string {
  return `
    <form id="message-form" class="chat-input">
      <textarea name="message" rows="2" placeholder="Message #channel (Enter to send, Shift+Enter for newline)" ${disabled ? "disabled" : ""}></textarea>
      <button type="submit" ${disabled ? "disabled" : ""}>Send</button>
    </form>
  `;
}
