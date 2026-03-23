import type { ServerSummary } from "../types";

interface ServerSidebarProps {
  servers: ServerSummary[];
  activeServerId: string | null;
  activeView: "chat" | "dms" | "activity" | "files" | "repo-tools";
}

function getInitials(name: string): string {
  const chunks = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");

  return chunks.join("") || name.slice(0, 2).toUpperCase();
}

export function renderServerSidebar({ servers, activeServerId, activeView }: ServerSidebarProps): string {
  const homeServer = servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;
  const homeInitials = homeServer ? getInitials(homeServer.name) : "HM";
  const additionalServers = servers
    .filter((server) => server.id !== homeServer?.id)
    .map(
      (server) => `
        <li>
          <button type="button" class="sidebar-nav-btn ${activeServerId === server.id ? "is-selected" : ""}" data-action="open-server" data-server-id="${server.id}" aria-label="${server.name}">
            <span class="sidebar-nav-glyph">${getInitials(server.name)}</span>
            <span class="sidebar-nav-label">${server.name}</span>
          </button>
        </li>
      `,
    )
    .join("");

  return `
    <aside class="server-sidebar" aria-label="Primary sidebar navigation">
      <div class="sidebar-window-controls" aria-hidden="true">
        <span class="window-dot window-dot--red"></span>
        <span class="window-dot window-dot--yellow"></span>
        <span class="window-dot window-dot--green"></span>
      </div>

      <button type="button" class="sidebar-brand" data-action="open-command-palette" aria-label="Open command palette">🐦</button>

      <ul class="server-nav-list">
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "chat" ? "is-selected" : ""}" ${homeServer ? `data-action="open-server" data-server-id="${homeServer.id}"` : "data-action=\"open-chat-panel\""} aria-label="${homeServer?.name ?? "Home"}">
            <span class="sidebar-nav-glyph">${homeInitials}</span>
            <span class="sidebar-nav-label">${homeServer?.name ?? "Home"}</span>
          </button>
        </li>
        ${additionalServers}
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "dms" ? "is-selected" : ""}" data-action="open-dms-panel" aria-label="Direct messages">
            <span class="sidebar-nav-glyph">💬</span>
            <span class="sidebar-nav-label">DMs</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "activity" ? "is-selected" : ""}" data-action="open-activity-panel" aria-label="Activity inbox">
            <span class="sidebar-nav-glyph">🔔</span>
            <span class="sidebar-nav-label">Activity</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "files" ? "is-selected" : ""}" data-action="open-files-panel" aria-label="Files browser">
            <span class="sidebar-nav-glyph">📁</span>
            <span class="sidebar-nav-label">Files</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "repo-tools" ? "is-selected" : ""}" data-action="open-repo-tools" aria-label="Tools">
            <span class="sidebar-nav-glyph">🛠️</span>
            <span class="sidebar-nav-label">Tools</span>
          </button>
        </li>
        <li>
          <details class="sidebar-more">
            <summary class="sidebar-nav-btn" aria-label="More options">
              <span class="sidebar-nav-glyph">•••</span>
              <span class="sidebar-nav-label">More</span>
            </summary>
            <div class="sidebar-more-menu" role="menu" aria-label="More sidebar actions">
              <button type="button" data-action="toggle-settings" role="menuitem">Settings</button>
              <button type="button" data-action="toggle-compact-mode" role="menuitem">Compact mode</button>
              <button type="button" data-action="open-command-palette" role="menuitem">Command palette</button>
            </div>
          </details>
        </li>
      </ul>

      <button type="button" class="sidebar-compose-btn" data-action="create-server" aria-label="Create workspace">+</button>

      <button type="button" class="sidebar-profile" data-action="toggle-settings" aria-label="Profile and status">
        <span class="sidebar-profile-avatar">🙂</span>
        <span class="sidebar-profile-status" aria-hidden="true"></span>
      </button>
    </aside>
  `;
}
