import { FEATURE_UI_ENTRIES } from "../settings/feature-entrypoints";

/** All widget-panel uiEntry ids that need placeholder surfaces. */
const WIDGET_PANEL_IDS = [
  "feature-widget-townhall-sfu",
  "feature-widget-shell-layouts",
  "feature-widget-media-pipeline",
  "feature-widget-media-spoilers",
  "feature-widget-media-codeblocks",
  "feature-widget-link-previews",
  "feature-widget-element-call",
  "feature-widget-matrix-compat",
  "feature-widget-bmc-soundboard",
  "feature-widget-bmc-numbers-station",
  "feature-widget-bmc-stage-channels",
  "feature-widget-leaderboards",
] as const;

export type WidgetPanelId = (typeof WIDGET_PANEL_IDS)[number];

interface WidgetPanelHostProps {
  enabledFeatures: Record<string, boolean>;
  /** When set, only render this single widget (opened from quick-action). */
  activeWidgetId?: string | null;
}

function renderWidgetCard(
  uiEntryId: string,
  name: string,
  enabled: boolean,
): string {
  if (enabled) {
    return `
      <article class="widget-panel-item" data-testid="${uiEntryId}">
        <h3 class="widget-panel-item-title">${name}</h3>
        <p class="meta">Feature surface available.</p>
      </article>
    `;
  }

  return `
    <article class="widget-panel-item widget-panel-item--unavailable" data-testid="${uiEntryId}-unavailable">
      <h3 class="widget-panel-item-title">${name}</h3>
      <p class="meta coming-soon">Coming soon · not enabled in active preset</p>
    </article>
  `;
}

export function renderWidgetPanelHost({
  enabledFeatures,
  activeWidgetId = null,
}: WidgetPanelHostProps): string {
  // Build a lookup map from uiEntry id → entry
  const entryByUiId = new Map(
    FEATURE_UI_ENTRIES.filter((e) => e.uiEntry.startsWith("widget_panel:")).map(
      (e) => [e.uiEntry.split(":")[1], e] as [string, typeof e],
    ),
  );

  const idsToRender: string[] = activeWidgetId
    ? [activeWidgetId]
    : [...WIDGET_PANEL_IDS];

  const cards = idsToRender
    .map((uiId) => {
      const entry = entryByUiId.get(uiId);
      if (!entry) return "";
      const enabled = enabledFeatures[entry.presetKey] ?? false;
      return renderWidgetCard(uiId, entry.name, enabled);
    })
    .filter(Boolean)
    .join("");

  const panelTitle = activeWidgetId
    ? (entryByUiId.get(activeWidgetId)?.name ?? "Widget panel")
    : "Widget panels";

  return `
    <section class="widget-panel-host" data-testid="widget-panel-host">
      <header class="widget-panel-host-header">
        <h2>${panelTitle}</h2>
        <p class="meta">Feature surfaces embedded alongside chat.</p>
      </header>
      <div class="widget-panel-grid">
        ${cards || '<p class="empty">No widget panels available.</p>'}
      </div>
    </section>
  `;
}
