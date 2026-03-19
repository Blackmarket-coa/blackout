import type { ChatMessage } from "../types";
import { formatTime } from "../utils/format";

export function renderMessageItem(message: ChatMessage): string {
  return `
    <li class="message-item" data-message-id="${message.id}">
      <div class="message-meta">
        <strong>${message.sender}</strong>
        <time datetime="${message.timestamp}">${formatTime(message.timestamp)}</time>
      </div>
      <p>${message.body}</p>
    </li>
  `;
}
