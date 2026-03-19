import type { ChannelSummary } from "../types";

interface ChannelSidebarProps {
  serverName: string;
  channels: ChannelSummary[];
  activeChannelId: string | null;
}

export function renderChannelSidebar({ serverName, channels, activeChannelId }: ChannelSidebarProps): string {
  const channelItems = channels
    .map(
      (channel) =>
        `<li><button type="button" class="sidebar-btn ${channel.id === activeChannelId ? "is-selected" : ""}" data-action="open-channel" data-channel-id="${channel.id}"># ${channel.name}</button></li>`,
    )
    .join("");

  return `
    <aside class="channel-list">
      <div class="sidebar-head">${serverName}</div>
      <ul>${channelItems || '<li class="empty">No channels yet</li>'}</ul>
      <button type="button" class="add-btn" data-action="create-channel">+ Create Channel</button>
    </aside>
  `;
}
