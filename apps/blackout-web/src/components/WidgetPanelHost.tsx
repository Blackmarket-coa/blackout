import { FEATURE_UI_ENTRIES } from "../settings/feature-entrypoints";

const WIDGET_ENTRY_IDS = new Set([
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
]);

export function renderWidgetPanelHost(features: Record<string, boolean>): string {
  const widgetEntries = FEATURE_UI_ENTRIES.filter((entry) => {
    const [kind, uiEntryId] = entry.uiEntry.split(":");
    return kind === "widget_panel" && WIDGET_ENTRY_IDS.has(uiEntryId);
  });

  const rows = widgetEntries
    .map((entry) => {
      const [, uiEntryId] = entry.uiEntry.split(":");
      const enabled = features[entry.presetKey] ?? false;
      const testId = `${uiEntryId}-unavailable`;
      return `
        <article class="panel-card" data-testid="widget-panel-entry-${uiEntryId}">
          <strong>${entry.name}</strong>
          ${enabled ? '<p class="meta">Coming soon</p>' : `<p class="meta" data-testid="${testId}">Feature unavailable in current preset.</p>`}
        </article>
      `;
    })
    .join("");

  return `
    <section class="widget-panel-host" data-testid="widget-panel-host">
      ${rows || '<p class="meta">No widget panel entries configured.</p>'}
    </section>
  `;
}
