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
  const uniqueParticipants = new Set(messages.map((message) => message.sender)).size;
  const lastMessage = messages[messages.length - 1];
  const freshnessLabel = lastMessage ? formatRecency(lastMessage.timestamp) : "No activity yet";

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
        <div class="chat-head-presence" aria-label="Channel activity snapshot">
          <span class="chat-head-chip">${uniqueParticipants} active</span>
          <span class="chat-head-chip">${messages.length} messages</span>
          <span class="chat-head-chip">${freshnessLabel}</span>
        </div>
        <div class="chat-head-actions">
          <button type="button" class="ghost-btn chat-head-action" data-action="open-right-panel" data-panel="members" aria-label="Open member list">Members</button>
          <button type="button" class="ghost-btn chat-head-action" data-action="open-right-panel" data-panel="search" aria-label="Search channel">Search</button>
          <details class="chat-head-overflow">
            <summary class="ghost-btn chat-head-action" aria-label="More actions">···</summary>
            <div class="chat-head-overflow-menu" role="menu">
              <button type="button" class="ghost-btn" data-action="open-right-panel" data-panel="threads" role="menuitem">Threads</button>
              <button type="button" class="ghost-btn" data-action="open-right-panel" data-panel="pinned" role="menuitem">Pinned</button>
              <button type="button" class="ghost-btn" data-action="open-right-panel" data-panel="governance" role="menuitem">Governance</button>
            </div>
          </details>
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
  let previousDayKey: string | null = null;

  return messages
    .map((message, index) => {
      const previous = messages[index - 1];
      const compact = forceCompact || shouldCompact(previous, message);
      const dayKey = dayKeyForMessage(message.timestamp);
      const dayDivider =
        dayKey !== previousDayKey ? `<li class="message-day-divider"><span>${formatDayLabel(message.timestamp)}</span></li>` : "";
      previousDayKey = dayKey;
      return `${dayDivider}${renderMessageItem(message, { compact })}`;
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

function dayKeyForMessage(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  return `${parsed.getUTCFullYear()}-${parsed.getUTCMonth()}-${parsed.getUTCDate()}`;
}

function formatDayLabel(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "Conversation";
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatRecency(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "No activity yet";

  const elapsedMs = Date.now() - parsed.getTime();
  if (elapsedMs < 60_000) return "Live now";
  if (elapsedMs < 3_600_000) return `${Math.max(1, Math.floor(elapsedMs / 60_000))}m ago`;
  if (elapsedMs < 86_400_000) return `${Math.max(1, Math.floor(elapsedMs / 3_600_000))}h ago`;
  return `${Math.max(1, Math.floor(elapsedMs / 86_400_000))}d ago`;
}
