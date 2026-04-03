import type { ServerSummary } from "../types";

interface ServerSidebarProps {
  servers: ServerSummary[];
  activeServerId: string | null;
  activeView: "chat" | "dms" | "activity" | "files" | "repo-tools" | "discover";
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
          </button>
        </li>
      `,
    )
    .join("");

  return `
    <aside class="server-sidebar" aria-label="Primary sidebar navigation">

      <button type="button" class="sidebar-brand" data-action="open-command-palette" aria-label="Open command palette">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </button>

      <div class="sidebar-divider"></div>

      <ul class="server-nav-list" role="list">
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "chat" ? "is-selected" : ""}" ${homeServer ? `data-action="open-server" data-server-id="${homeServer.id}"` : `data-action="open-chat-panel"`} aria-label="${homeServer?.name ?? "Home"}">
            <span class="sidebar-nav-glyph">${homeInitials}</span>
          </button>
        </li>
        ${additionalServers}
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "dms" ? "is-selected" : ""}" data-action="open-dms-panel" aria-label="Direct messages">
            <span class="sidebar-nav-glyph">💬</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "activity" ? "is-selected" : ""}" data-action="open-activity-panel" aria-label="Activity inbox">
            <span class="sidebar-nav-glyph">🔔</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "files" ? "is-selected" : ""}" data-action="open-files-panel" aria-label="Files">
            <span class="sidebar-nav-glyph">📁</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "repo-tools" ? "is-selected" : ""}" data-action="open-repo-tools" aria-label="Tools">
            <span class="sidebar-nav-glyph">🔧</span>
          </button>
        </li>
      </ul>

      <div class="sidebar-divider"></div>

      <button type="button" class="sidebar-nav-btn" data-action="create-server" aria-label="Create space" style="border: 2px dashed var(--text-faint); background: none; color: var(--text-faint);" onmouseover="this.style.borderColor='var(--teal)'; this.style.color='var(--teal)'; this.style.background='var(--bg-hover)';" onmouseout="this.style.borderColor='var(--text-faint)'; this.style.color='var(--text-faint)'; this.style.background='none';">
        <span style="font-size: 22px; font-weight: 300;">+</span>
      </button>

      <details class="sidebar-more" style="margin-top: auto;">
        <summary class="sidebar-nav-btn" aria-label="More options" style="list-style: none;">
          <span class="sidebar-nav-glyph">⚙</span>
        </summary>
        <div class="sidebar-more-menu" role="menu" aria-label="More sidebar actions">
          <button type="button" data-action="toggle-settings" data-testid="toggle-settings-button" role="menuitem">Settings</button>
          <button type="button" data-action="toggle-compact-mode" data-testid="toggle-compact-mode" role="menuitem">Compact mode</button>
          <button type="button" data-action="open-command-palette" data-testid="open-command-palette" role="menuitem">Command palette</button>
        </div>
      </details>

    </aside>
  `;
}
