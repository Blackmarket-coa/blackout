import type { ChatMessage } from "../types";
import { renderMessageItem } from "./MessageItem";
import { renderMessageInput } from "./MessageInput";

interface ChatWindowProps {
  channelLabel: string;
  messages: ChatMessage[];
  canSend: boolean;
  sendPending: boolean;
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

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function renderChatWindow({
  channelLabel,
  messages,
  canSend,
  sendPending,
  richEditingEnabled,
  stegoEnabled,
  composerRepliesEnabled,
  composerEditsEnabled,
  composerRedactionsEnabled,
  mediaCodeBlocksEnabled,
  mediaSpoilersEnabled,
  typingIndicatorsEnabled,
  showTypingIndicator,
}: ChatWindowProps): string {
  const renderedMessages = renderGroupedMessages(messages);

  return `
    <section class="chat-window">
      <div class="chat-head">
        <button type="button" class="mobile-toggle" data-action="toggle-channel-drawer">☰</button>
        <div class="chat-head-copy">
          <span>${channelLabel}</span>
          <small>Stay on topic, react quickly, and keep conversations moving.</small>
        </div>
      </div>
      <ul class="message-list">${renderedMessages || '<li class="empty">No messages yet — start the conversation with a quick hello 👋</li>'}</ul>
      ${renderMessageInput({
        disabled: !canSend || sendPending,
        richEditingEnabled,
        stegoEnabled,
        composerRepliesEnabled,
        composerEditsEnabled,
        composerRedactionsEnabled,
        mediaCodeBlocksEnabled,
        mediaSpoilersEnabled,
        typingIndicatorsEnabled,
        showTypingIndicator,
      })}
    </section>
  `;
}

function renderGroupedMessages(messages: ChatMessage[]): string {
  return messages
    .map((message, index) => {
      const previous = messages[index - 1];
      const compact = shouldCompact(previous, message);
      return renderMessageItem(message, { compact });
    })
    .join("");
}

function shouldCompact(previous: ChatMessage | undefined, current: ChatMessage): boolean {
  if (!previous) return false;
  if (previous.sender !== current.sender) return false;

  const previousTime = Date.parse(previous.timestamp);
  const currentTime = Date.parse(current.timestamp);
  if (Number.isNaN(previousTime) || Number.isNaN(currentTime)) return false;

  return currentTime - previousTime <= GROUP_WINDOW_MS;
}
