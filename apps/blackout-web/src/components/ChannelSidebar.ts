import type { ChannelSummary } from "../types";

interface ChannelSidebarProps {
  serverName: string;
  channels: ChannelSummary[];
  activeChannelId: string | null;
  unreadByChannel: Record<string, number>;
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
  if (normalized.includes("gov") || normalized.includes("vote") || normalized.includes("proposal")) return "governance";
  if (normalized.includes("voice") || normalized.includes("stage") || normalized.includes("call")) return "voice";
  if (normalized.includes("forum") || normalized.includes("thread")) return "forum";
  if (normalized.includes("announce") || normalized.includes("news")) return "announcement";
  return "text";
}

export function renderChannelSidebar({ serverName, channels, activeChannelId, unreadByChannel }: ChannelSidebarProps): string {
  const channelItems = channels
    .map((channel) => {
      const unreadCount = unreadByChannel[channel.id] ?? 0;
      const kind = inferChannelKind(channel.name);
      const kindMeta = CHANNEL_KIND_META[kind];
      return `<li><button type="button" class="sidebar-btn channel-btn channel-kind--${kind} ${channel.id === activeChannelId ? "is-selected" : ""}" data-action="open-channel" data-channel-id="${channel.id}" aria-label="${kindMeta.label}: ${channel.name}"><span class="channel-btn-label"><span class="channel-kind-icon" aria-hidden="true">${kindMeta.icon}</span>${channel.name}</span>${unreadCount > 0 ? ` <span class="badge">${unreadCount}</span>` : ""}</button></li>`;
    })
    .join("");

  return `
    <aside class="channel-list">
      <div class="sidebar-workspace-name">${serverName}</div>
      <div class="sidebar-section-head">
        <span>Channels</span>
        <button type="button" class="ghost-btn section-icon-btn" data-action="create-channel" aria-label="Create channel">+</button>
      </div>
      <ul>${channelItems || '<li class="empty">No channels yet — create your first topic channel.</li>'}
        <li><button type="button" class="sidebar-btn channel-browse-btn" data-action="browse-channels">Browse channels</button></li>
      </ul>
    </aside>
  `;
}
