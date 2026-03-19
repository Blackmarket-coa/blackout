import type { ChatMessage } from "../types";
import { formatTime } from "../utils/format";

interface MessageItemOptions {
  compact?: boolean;
}

export function renderMessageItem(message: ChatMessage, options: MessageItemOptions = {}): string {
  const compact = options.compact ?? false;

  if (compact) {
    return `
      <li class="message-item message-item--compact" data-message-id="${message.id}">
        <p>${message.body}</p>
      </li>
    `;
  }

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
