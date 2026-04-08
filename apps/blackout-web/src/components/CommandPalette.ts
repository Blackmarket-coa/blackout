import { FEATURE_UI_ENTRIES } from "../settings/feature-entrypoints";

/**
 * The uiEntry ids that surface in the user-facing command palette.
 * Leaderboards also appears as a command surface in addition to widget_panel.
 */
const COMMAND_PALETTE_UI_IDS = new Set([
  "feature-command-discover",
  "feature-command-presence-digest",
  "feature-widget-leaderboards",
]);

export interface CommandPaletteEntry {
  featureId: string;
  uiEntryId: string;
  label: string;
  description: string;
  enabled: boolean;
}

export function getCommandPaletteEntries(
  enabledFeatures: Record<string, boolean>,
): CommandPaletteEntry[] {
  return FEATURE_UI_ENTRIES.filter((entry) => {
    const uiEntryId = entry.uiEntry.split(":")[1];
    return COMMAND_PALETTE_UI_IDS.has(uiEntryId ?? "");
  }).map((entry) => ({
    featureId: entry.id,
    uiEntryId: entry.uiEntry.split(":")[1] ?? entry.id,
    label: entry.name,
    description: `Feature: ${entry.id}`,
    enabled: enabledFeatures[entry.presetKey] ?? false,
  }));
}

interface CommandPaletteProps {
  open: boolean;
  query: string;
  enabledFeatures: Record<string, boolean>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderCommandPalette({
  open,
  query,
  enabledFeatures,
}: CommandPaletteProps): string {
  if (!open) return "";

  const allEntries = getCommandPaletteEntries(enabledFeatures);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? allEntries.filter(
        (e) =>
          e.label.toLowerCase().includes(q) ||
          e.featureId.toLowerCase().includes(q),
      )
    : allEntries;

  const items = filtered
    .map((entry) => {
      if (entry.enabled) {
        return `
          <button
            type="button"
            class="command-palette-item"
            data-action="user-command-select"
            data-feature-id="${escapeHtml(entry.featureId)}"
            data-ui-entry-id="${escapeHtml(entry.uiEntryId)}"
            data-testid="${escapeHtml(entry.uiEntryId)}"
          >
            <span class="command-palette-item-main">⌘ ${escapeHtml(entry.label)}</span>
            <kbd class="command-hint">⏎</kbd>
          </button>
        `;
      }
      return `
        <div
          class="command-palette-item command-palette-item--unavailable"
          data-testid="${escapeHtml(entry.uiEntryId)}-unavailable"
          aria-disabled="true"
        >
          <span class="command-palette-item-main">⌘ ${escapeHtml(entry.label)}</span>
          <span class="meta">Not available in active preset</span>
        </div>
      `;
    })
    .join("");

  const emptyState =
    filtered.length === 0
      ? `<p class="empty" data-testid="command-palette-empty">No commands match "${escapeHtml(query)}"</p>`
      : "";

  return `
    <div class="command-palette-backdrop" data-action="close-user-command-palette" data-testid="user-command-palette-backdrop">
      <section
        class="command-palette"
        data-testid="user-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div class="command-palette-header">
          <strong>Commands</strong>
          <button type="button" class="ghost-btn" data-action="close-user-command-palette">Close</button>
        </div>
        <input
          type="search"
          autofocus
          class="command-palette-input"
          data-action="user-command-palette-query"
          data-testid="user-command-palette-input"
          placeholder="Type a command…"
          value="${escapeHtml(query)}"
        />
        <div class="command-palette-list" role="listbox">
          ${items}${emptyState}
        </div>
        <footer class="command-palette-footer">
          <kbd>Esc</kbd> to close
        </footer>
      </section>
    </div>
  `;
}
