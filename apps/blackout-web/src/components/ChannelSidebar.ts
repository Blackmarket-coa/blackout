import type { ChannelSummary } from "../types";

interface ChannelSidebarProps {
  serverName: string;
  channels: ChannelSummary[];
  activeChannelId: string | null;
  unreadByChannel: Record<string, number>;
  currentUserDisplayName?: string;
  currentUserHandle?: string;
}

type ChannelKind = "text" | "voice" | "governance" | "forum" | "announcement";

const CHANNEL_KIND_META: Record<ChannelKind, { icon: string; label: string }> = {
  text: { icon: "#", label: "Text room" },
  voice: { icon: "🔊", label: "Voice room" },
  governance: { icon: "🗳️", label: "Governance room" },
  forum: { icon: "🧵", label: "Forum room" },
  announcement: { icon: "📣", label: "Announcement room" },
};

function inferChannelKind(channelName: string): ChannelKind {
  const normalized = channelName.toLowerCase();
  if (
    normalized.includes("gov") ||
    normalized.includes("vote") ||
    normalized.includes("proposal") ||
    normalized.includes("dispute") ||
    normalized.includes("treasury")
  )
    return "governance";
  if (normalized.includes("voice") || normalized.includes("stage") || normalized.includes("call") || normalized.includes("town")) return "voice";
  if (normalized.includes("forum") || normalized.includes("thread")) return "forum";
  if (normalized.includes("announce") || normalized.includes("news")) return "announcement";
  return "text";
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 1)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || name.slice(0, 1).toUpperCase()
  );
}

function renderChannelItem(channel: ChannelSummary, activeChannelId: string | null, unreadByChannel: Record<string, number>): string {
  const unreadCount = unreadByChannel[channel.id] ?? 0;
  const kind = inferChannelKind(channel.name);
  const kindMeta = CHANNEL_KIND_META[kind];
  const isGovernance = kind === "governance";
  const badgeClass = isGovernance ? "badge badge--governance" : "badge";

  return `
    <li>
      <button type="button"
        class="channel-btn channel-kind--${kind} ${channel.id === activeChannelId ? "is-selected" : ""}"
        data-action="open-channel"
        data-channel-id="${channel.id}"
        aria-label="${kindMeta.label}: ${channel.name}">
        <span class="channel-btn-label">
          <span class="channel-kind-icon" aria-hidden="true">${kindMeta.icon}</span>
          <span>${channel.name}</span>
        </span>
        ${unreadCount > 0 ? `<span class="${badgeClass}">${unreadCount}</span>` : ""}
      </button>
    </li>
  `;
}

export function renderChannelSidebar({
  serverName,
  channels,
  activeChannelId,
  unreadByChannel,
  currentUserDisplayName = "User",
  currentUserHandle = "@user",
}: ChannelSidebarProps): string {
  // Partition channels into named categories
  const generalChannels = channels.filter((ch) => {
    const k = inferChannelKind(ch.name);
    return k === "text" || k === "forum" || k === "announcement";
  });
  const governanceChannels = channels.filter((ch) => inferChannelKind(ch.name) === "governance");
  const voiceChannels = channels.filter((ch) => inferChannelKind(ch.name) === "voice");

  function section(label: string, items: ChannelSummary[]): string {
    if (items.length === 0) return "";
    return `
      <div class="sidebar-section-head" aria-label="${label} channels">
        <span>${label}</span>
        <button type="button" class="section-icon-btn" data-action="create-channel" aria-label="Add channel to ${label}">+</button>
      </div>
      <ul role="list">
        ${items.map((ch) => renderChannelItem(ch, activeChannelId, unreadByChannel)).join("")}
      </ul>
    `;
  }

  const initials = getInitials(currentUserDisplayName);

  return `
    <aside class="channel-list" aria-label="Channel list">
      <div class="sidebar-workspace-name">
        ${serverName}
      </div>

      <div class="channel-list-scroll">
        ${channels.length === 0 ? '<p class="empty" style="padding: 12px 16px; font-size: 13px;">No channels yet.</p>' : ""}
        ${section("General", generalChannels)}
        ${section("Governance", governanceChannels)}
        ${section("Voice", voiceChannels)}
        <li style="list-style: none;">
          <button type="button" class="channel-browse-btn" data-action="browse-channels">Browse channels</button>
        </li>
      </div>

      <div class="user-panel">
        <div class="user-panel-avatar">
          ${initials}
          <div class="user-panel-status" aria-hidden="true"></div>
        </div>
        <div class="user-panel-info">
          <div class="user-panel-name">${currentUserDisplayName}</div>
          <div class="user-panel-handle">${currentUserHandle}</div>
        </div>
        <div class="user-panel-controls">
          <button type="button" class="user-ctrl-btn" data-action="toggle-mute" title="Mute" aria-label="Toggle mute">🎤</button>
          <button type="button" class="user-ctrl-btn" data-action="toggle-settings" title="Settings" aria-label="Settings">⚙</button>
        </div>
      </div>
    </aside>
  `;
}
