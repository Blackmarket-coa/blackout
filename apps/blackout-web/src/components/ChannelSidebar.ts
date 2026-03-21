import type { ChannelSummary } from "../types";

interface ChannelSidebarProps {
  serverName: string;
  channels: ChannelSummary[];
  activeChannelId: string | null;
  unreadByChannel: Record<string, number>;
}

export function renderChannelSidebar({ serverName, channels, activeChannelId, unreadByChannel }: ChannelSidebarProps): string {
  const channelItems = channels
    .map((channel) => {
      const unreadCount = unreadByChannel[channel.id] ?? 0;
      return `<li><button type="button" class="sidebar-btn channel-btn ${channel.id === activeChannelId ? "is-selected" : ""}" data-action="open-channel" data-channel-id="${channel.id}"><span class="channel-btn-label"># ${channel.name}</span>${unreadCount > 0 ? ` <span class="badge">${unreadCount}</span>` : ""}</button></li>`;
    })
    .join("");

  return `
    <aside class="channel-list">
      <div class="sidebar-workspace-name">${serverName}</div>
      <div class="sidebar-section-head">
        <span>Channels</span>
        <button type="button" class="ghost-btn section-icon-btn" data-action="create-channel" aria-label="Create channel">+</button>
      </div>
      <ul>${channelItems || '<li class="empty">No channels yet — create your first topic channel.</li>'}</ul>
      <div class="channel-footer-actions">
        <button type="button" class="add-btn channel-browse-btn" data-action="browse-channels">Browse channels</button>
        <button type="button" class="add-btn channel-create-btn" data-action="create-channel">Create channel</button>
      </div>
    </aside>
  `;
}
