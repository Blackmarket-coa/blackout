import type { ServerSummary } from "../types";

interface ServerSidebarProps {
  servers: ServerSummary[];
  activeServerId: string | null;
}

function getInitials(name: string): string {
  const chunks = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");

  return chunks.join("") || name.slice(0, 2).toUpperCase();
}

export function renderServerSidebar({ servers, activeServerId }: ServerSidebarProps): string {
  const homeServer = servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;
  const homeInitials = homeServer ? getInitials(homeServer.name) : "HM";

  return `
    <aside class="server-sidebar" aria-label="Primary sidebar navigation">
      <div class="sidebar-window-controls" aria-hidden="true">
        <span class="window-dot window-dot--red"></span>
        <span class="window-dot window-dot--yellow"></span>
        <span class="window-dot window-dot--green"></span>
      </div>

      <button type="button" class="sidebar-brand" aria-label="Blackout home">🐦</button>

      <ul class="server-nav-list">
        <li>
          <button type="button" class="sidebar-nav-btn is-selected" ${homeServer ? `data-action="open-server" data-server-id="${homeServer.id}"` : ""} aria-label="Home">
            <span class="sidebar-nav-glyph">${homeInitials}</span>
            <span class="sidebar-nav-label">Home</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn" aria-label="Direct messages">
            <span class="sidebar-nav-glyph">💬</span>
            <span class="sidebar-nav-label">DMs</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn" aria-label="Activity">
            <span class="sidebar-nav-glyph">🔔</span>
            <span class="sidebar-nav-label">Activity</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn" aria-label="Files">
            <span class="sidebar-nav-glyph">📁</span>
            <span class="sidebar-nav-label">Files</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn" aria-label="Tools">
            <span class="sidebar-nav-glyph">🛠️</span>
            <span class="sidebar-nav-label">Tools</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn" aria-label="More">
            <span class="sidebar-nav-glyph">•••</span>
            <span class="sidebar-nav-label">More</span>
          </button>
        </li>
      </ul>

      <button type="button" class="sidebar-compose-btn" data-action="create-server" aria-label="Create workspace">+</button>

      <button type="button" class="sidebar-profile" aria-label="Profile and status">
        <span class="sidebar-profile-avatar">🙂</span>
        <span class="sidebar-profile-status" aria-hidden="true"></span>
      </button>
    </aside>
  `;
}
