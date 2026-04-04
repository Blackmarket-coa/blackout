import type { ChatMessage } from "../types";
import { renderMessageItem } from "./MessageItem";
import { renderMessageInput } from "./MessageInput";

interface ChatWindowProps {
  channelLabel: string;
  messages: ChatMessage[];
  canSend: boolean;
  canPropose: boolean;
  governanceEnabled: boolean;
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
  attachmentMode: "quick-add" | "library" | "bulk-import";
  compactMode: boolean;
  compactRecommended: boolean;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function renderChatWindow({
  channelLabel,
  messages,
  canSend,
  canPropose,
  governanceEnabled,
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
  attachmentMode,
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
        <div class="chat-head-left">
          <button type="button" class="mobile-toggle" data-action="toggle-channel-drawer" aria-label="Toggle channel drawer">☰</button>
          <div class="chat-head-title">
            <span class="chat-head-hash">#</span>
            <span>${channelLabel}</span>
          </div>
          <span class="chat-head-topic">${compactMode ? "Compact mode active" : compactRecommended ? "Compact mode recommended" : "End-to-end encrypted"}</span>
          <span class="chat-head-chip">🛡 E2EE Verified</span>
        </div>
        <div class="chat-head-actions">
          <button type="button" class="chat-head-action" data-action="open-right-panel" data-panel="threads" title="Threads" aria-label="Open threads">🧵</button>
          <button type="button" class="chat-head-action" data-action="open-right-panel" data-panel="pinned" title="Pinned" aria-label="View pinned messages">📌</button>
          <button type="button" class="chat-head-action" data-action="open-right-panel" data-panel="members" title="Members" aria-label="Open member list">👥</button>
          <button type="button" class="chat-head-action" data-action="open-right-panel" data-panel="search" title="Search panel" aria-label="Open search panel">🔎</button>
          <button type="button" class="chat-head-action" data-action="open-right-panel" data-panel="governance" title="Governance vote panel" aria-label="Open governance vote panel" ${governanceEnabled ? "" : "disabled"}>🏛️</button>
          <input type="search" class="chat-head-search" placeholder="Search…" aria-label="Search channel" data-action="focus-search">
        </div>
      </div>
      <ul class="message-list">${renderedMessages || '<li class="empty" style="padding: 20px; color: var(--text-muted); font-size: 14px;">No messages yet — start the conversation 👋</li>'}</ul>
      ${renderMessageInput({
        disabled: !canSend || sendPending,
        canPropose,
        governanceEnabled,
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
        attachmentMode,
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
        dayKey !== previousDayKey ? `<li class="message-day-divider">${formatDayLabel(message.timestamp)}</li>` : "";
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
