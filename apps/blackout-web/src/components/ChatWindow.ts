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
  compactMode: boolean;
  compactRecommended: boolean;
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
  compactMode,
  compactRecommended,
}: ChatWindowProps): string {
  const renderedMessages = renderGroupedMessages(messages, compactMode);

  return `
    <section class="chat-window">
      <div class="chat-head">
        <button type="button" class="mobile-toggle" data-action="toggle-channel-drawer" aria-label="Toggle channel drawer">☰</button>
        <div class="chat-head-copy">
          <span># ${channelLabel}</span>
          <small>
            Team updates and fast decisions happen here.
            ${compactMode ? " Compact mode is active for this high-density stream." : compactRecommended ? " Compact mode is recommended for message-heavy channels." : ""}
          </small>
        </div>
        <div class="chat-head-actions">
          <button type="button" class="ghost-btn chat-head-action" data-action="open-right-panel" data-panel="members" aria-label="Open member list">Members</button>
          <button type="button" class="ghost-btn chat-head-action" data-action="open-right-panel" data-panel="threads" aria-label="Open threads">Threads</button>
          <button type="button" class="ghost-btn chat-head-action" data-action="open-right-panel" data-panel="pinned" aria-label="Open pinned messages">Pinned</button>
          <button type="button" class="ghost-btn chat-head-action" data-action="open-right-panel" data-panel="search" aria-label="Search channel">Search</button>
          <button type="button" class="ghost-btn chat-head-action" data-action="open-right-panel" data-panel="governance" aria-label="Open governance panel">Governance</button>
        </div>
      </div>
      <ul class="message-list">${renderedMessages || '<li class="empty">No messages yet — start the conversation with a quick hello 👋</li>'}</ul>
      ${renderMessageInput({
        disabled: !canSend || sendPending,
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
      })}
    </section>
  `;
}

function renderGroupedMessages(messages: ChatMessage[], forceCompact: boolean): string {
  return messages
    .map((message, index) => {
      const previous = messages[index - 1];
      const compact = forceCompact || shouldCompact(previous, message);
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
