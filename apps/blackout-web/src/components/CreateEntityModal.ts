import type { PendingCreate } from "../store/app-store";

interface CreateEntityModalProps {
  mode: Exclude<PendingCreate, "none">;
  value: string;
  error: string | null;
  busy: boolean;
}

export function renderCreateEntityModal({ mode, value, error, busy }: CreateEntityModalProps): string {
  const isServer = mode === "server";
  const title = isServer ? "Create server" : "Create channel";
  const placeholder = isServer ? "e.g. Product Ops" : "e.g. release-planning";

  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${title}">
        <h3>${title}</h3>
        <form id="create-entity-form" class="stack">
          <label>
            Name
            <input name="name" maxlength="40" value="${escapeAttribute(value)}" placeholder="${placeholder}" autofocus />
          </label>
          ${error ? `<p class="error" role="alert">${error}</p>` : ""}
          <div class="modal-actions">
            <button type="button" class="ghost-btn" data-action="cancel-create">Cancel</button>
            <button type="submit" ${busy ? "disabled" : ""}>${busy ? "Creating..." : "Create"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function escapeAttribute(raw: string): string {
  return raw.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
