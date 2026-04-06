import type { ServerSummary } from "../types";

interface ServerSidebarProps {
  servers: ServerSummary[];
  activeServerId: string | null;
  activeView: "home" | "rooms" | "dms" | "activity" | "calls" | "admin";
  showAdminEntry: boolean;
}

function getInitials(name: string): string {
  const chunks = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");

  return chunks.join("") || name.slice(0, 2).toUpperCase();
}

export function renderServerSidebar({ servers, activeServerId, activeView, showAdminEntry }: ServerSidebarProps): string {
  const homeServer = servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;
  const homeInitials = homeServer ? getInitials(homeServer.name) : "HM";

  return `
    <aside class="server-sidebar" aria-label="Primary sidebar navigation">
      <button type="button" class="sidebar-brand" data-action="open-home-panel" aria-label="Open home">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </button>

      <div class="sidebar-divider"></div>

      <ul class="server-nav-list" role="list">
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "home" ? "is-selected" : ""}" ${homeServer ? `data-action="open-server" data-server-id="${homeServer.id}"` : `data-action="open-home-panel"`} aria-label="Home">
            <span class="sidebar-nav-glyph">${homeInitials}</span>
          </button>
        </li>
        ${servers.filter((server) => server.id !== homeServer?.id).map((server) => `<li>
          <button type="button" class="sidebar-nav-btn ${server.id === activeServerId ? "is-selected" : ""}" data-action="open-server" data-server-id="${server.id}" aria-label="${server.name}">
            <span class="sidebar-nav-glyph">${getInitials(server.name)}</span>
          </button>
        </li>`).join("")}
        <li>
          <button type="button" class="sidebar-nav-btn ${activeView === "rooms" ? "is-selected" : ""}" data-action="open-rooms-panel" aria-label="Rooms">
            <span class="sidebar-nav-glyph">#</span>
          </button>
        </li>
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
          <button type="button" class="sidebar-nav-btn ${activeView === "calls" ? "is-selected" : ""}" data-action="open-calls-panel" aria-label="Calls">
            <span class="sidebar-nav-glyph">📞</span>
          </button>
        </li>
        <li>
          <button type="button" class="sidebar-nav-btn" data-action="open-files-panel" aria-label="Files">
            <span class="sidebar-nav-glyph">📁</span>
          </button>
        </li>
        ${showAdminEntry ? `<li>
          <button type="button" class="sidebar-nav-btn ${activeView === "admin" ? "is-selected" : ""}" data-action="open-admin-panel" aria-label="Admin">
            <span class="sidebar-nav-glyph">🛡</span>
          </button>
        </li>` : ""}
      </ul>

      <div class="sidebar-divider"></div>

      <button type="button" class="sidebar-nav-btn" data-action="create-server" aria-label="Create space" style="border: 2px dashed var(--text-faint); background: none; color: var(--text-faint);" onmouseover="this.style.borderColor='var(--teal)'; this.style.color='var(--teal)'; this.style.background='var(--bg-hover)';" onmouseout="this.style.borderColor='var(--text-faint)'; this.style.color='var(--text-faint)'; this.style.background='none';">
        <span style="font-size: 22px; font-weight: 300;">+</span>
      </button>
    </aside>
  `;
}
