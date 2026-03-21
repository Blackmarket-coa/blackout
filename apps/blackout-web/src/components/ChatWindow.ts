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
        <div class="chat-head-identity">
          <span class="chat-head-hash">#</span>
          <span class="chat-head-name">${channelLabel}</span>
        </div>
        <div class="chat-head-divider" aria-hidden="true"></div>
        <p class="chat-head-topic">${compactMode ? "Compact mode active." : "Team updates and fast decisions happen here."}</p>
        <div class="chat-head-actions">
          <button type="button" class="ghost-btn chat-head-action" aria-label="Open threads" title="Threads">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Threads</span>
          </button>
          <button type="button" class="ghost-btn chat-head-action" aria-label="Search channel" title="Search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Search</span>
          </button>
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
