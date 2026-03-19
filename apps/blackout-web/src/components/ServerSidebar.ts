import type { ServerSummary } from "../types";

interface ServerSidebarProps {
  servers: ServerSummary[];
  activeServerId: string | null;
}

export function renderServerSidebar({ servers, activeServerId }: ServerSidebarProps): string {
  const items = servers
    .map(
      (server) =>
        `<li><button type="button" class="sidebar-btn ${server.id === activeServerId ? "is-selected" : ""}" data-action="open-server" data-server-id="${server.id}">${server.name}</button></li>`,
    )
    .join("");

  return `
    <aside class="server-sidebar">
      <div class="sidebar-head">Servers</div>
      <ul>${items || '<li class="empty">No servers yet</li>'}</ul>
      <button type="button" class="add-btn" data-action="create-server">+ Create Server</button>
    </aside>
  `;
}
