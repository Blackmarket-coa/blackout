import { FEATURE_UI_ENTRIES } from "../settings/feature-entrypoints";

const COMMAND_ENTRY_IDS = new Set([
  "feature-command-discover",
  "feature-command-presence-digest",
  "feature-widget-leaderboards",
]);

interface RenderCommandPaletteOptions {
  open: boolean;
  query: string;
  features: Record<string, boolean>;
}

export function renderCommandPalette(options: RenderCommandPaletteOptions): string {
  if (!options.open) return "";

  const query = options.query.trim().toLowerCase();
  const rows = FEATURE_UI_ENTRIES.filter((entry) => {
    const [kind, uiEntryId] = entry.uiEntry.split(":");
    if (kind !== "command_palette" && uiEntryId !== "feature-widget-leaderboards") return false;
    if (!COMMAND_ENTRY_IDS.has(uiEntryId)) return false;
    const enabled = options.features[entry.presetKey] ?? false;
    const haystack = `${entry.name} ${entry.id} ${uiEntryId}`.toLowerCase();
    return enabled && (!query || haystack.includes(query));
  })
    .map((entry) => `
      <button type="button" class="command-palette-item" data-action="open-feature-entry" data-feature-id="${entry.id}" data-feature-kind="command_palette" data-action-origin="palette">
        <span class="command-palette-item-main">${entry.name}</span>
        <span class="meta">${entry.presetKey}</span>
      </button>
      <p class="meta">${entry.uiEntry}</p>
    `)
    .join("");

  return `
    <div class="command-palette-backdrop" data-action="close-command-palette">
      <section class="command-palette" data-testid="feature-command-palette" role="dialog" aria-modal="true" aria-label="Feature command palette">
        <div class="command-palette-header">
          <strong>Command palette</strong>
          <button type="button" class="ghost-btn" data-action="close-command-palette">Close</button>
        </div>
        <input type="search" autofocus data-action="filter-command-palette" data-testid="feature-command-palette-input" placeholder="Type a command…" value="${options.query}" />
        <div class="command-palette-list">${rows || '<p class="empty">No enabled commands in this preset.</p>'}</div>
      </section>
    </div>
  `;
}
