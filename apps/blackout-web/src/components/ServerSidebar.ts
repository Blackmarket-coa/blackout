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
  const items = servers
    .map((server) => {
      const initials = getInitials(server.name);
      return `<li><button type="button" class="sidebar-btn workspace-chip ${server.id === activeServerId ? "is-selected" : ""}" data-action="open-server" data-server-id="${server.id}" title="${server.name}" aria-label="${server.name}"><span aria-hidden="true">${initials}</span></button></li>`;
    })
    .join("");

  return `
    <aside class="server-sidebar">
      <div class="sidebar-head">Workspaces</div>
      <ul>${items || '<li class="empty">No workspaces yet</li>'}</ul>
      <button type="button" class="add-btn workspace-add-btn" data-action="create-server" aria-label="Create workspace">+</button>
    </aside>
  `;
}
