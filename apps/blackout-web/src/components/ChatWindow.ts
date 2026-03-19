import type { ChatMessage } from "../types";
import { renderMessageItem } from "./MessageItem";
import { renderMessageInput } from "./MessageInput";

interface ChatWindowProps {
  channelLabel: string;
  messages: ChatMessage[];
  canSend: boolean;
  sendPending: boolean;
}

export function renderChatWindow({ channelLabel, messages, canSend, sendPending }: ChatWindowProps): string {
  const renderedMessages = messages.map((message) => renderMessageItem(message)).join("");

  return `
    <section class="chat-window">
      <div class="chat-head">${channelLabel}</div>
      <ul class="message-list">${renderedMessages || '<li class="empty">No messages yet</li>'}</ul>
      ${renderMessageInput(!canSend || sendPending)}
    </section>
  `;
}
