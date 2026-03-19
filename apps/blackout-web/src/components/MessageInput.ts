export function renderMessageInput(disabled: boolean): string {
  return `
    <form id="message-form" class="chat-input">
      <input name="message" placeholder="Message #channel" ${disabled ? "disabled" : ""} />
      <button type="submit" ${disabled ? "disabled" : ""}>Send</button>
    </form>
  `;
}
