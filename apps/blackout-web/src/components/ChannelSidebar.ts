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
      return `<li><button type="button" class="sidebar-btn ${channel.id === activeChannelId ? "is-selected" : ""}" data-action="open-channel" data-channel-id="${channel.id}"># ${channel.name}${unreadCount > 0 ? ` <span class="badge">${unreadCount}</span>` : ""}</button></li>`;
    })
    .join("");

  return `
    <aside class="channel-list">
      <div class="sidebar-head">${serverName}</div>
      <ul>${channelItems || '<li class="empty">No channels yet</li>'}</ul>
      <button type="button" class="add-btn" data-action="create-channel">+ Create Channel</button>
    </aside>
  `;
}
