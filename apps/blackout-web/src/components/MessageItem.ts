import type { ChatMessage } from "../types";
import { formatTime } from "../utils/format";

interface MessageItemOptions {
  compact?: boolean;
}

const AVATAR_COLORS = [
  "linear-gradient(135deg, #e67e22, #f39c12)",
  "linear-gradient(135deg, #9b59b6, #8e44ad)",
  "linear-gradient(135deg, #1ABC9C, #16813D)",
  "linear-gradient(135deg, #e74c3c, #c0392b)",
  "linear-gradient(135deg, #3498db, #2980b9)",
  "linear-gradient(135deg, #16813D, #1ABC9C)",
  "linear-gradient(135deg, #f39c12, #e67e22)",
  "linear-gradient(135deg, #2ecc71, #27ae60)",
];

function colorForSender(sender: string): string {
  let hash = 0;
  for (let i = 0; i < sender.length; i++) {
    hash = (hash * 31 + sender.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitial(sender: string): string {
  return sender.slice(0, 1).toUpperCase();
}

export function renderMessageItem(message: ChatMessage, options: MessageItemOptions = {}): string {
  const compact = options.compact ?? false;

  if (compact) {
    return `
      <li class="message-item message-item--compact" data-message-id="${message.id}">
        <div class="message-body-wrap">
          <p>${message.body}</p>
        </div>
      </li>
    `;
  }

  const avatarColor = colorForSender(message.sender);
  const initial = getInitial(message.sender);
  const timeStr = formatTime(message.timestamp);

  return `
    <li class="message-item" data-message-id="${message.id}">
      <div class="message-avatar" style="background: ${avatarColor};" aria-hidden="true">${initial}</div>
      <div class="message-body-wrap">
        <div class="message-meta">
          <span class="message-author">${message.sender}</span>
          <time datetime="${message.timestamp}">${timeStr}</time>
        </div>
        <p>${message.body}</p>
      </div>
    </li>
  `;
}
