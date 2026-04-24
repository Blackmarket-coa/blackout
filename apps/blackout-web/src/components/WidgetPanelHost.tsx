import { FEATURE_UI_ENTRIES } from "../settings/feature-entrypoints";
import { resolveEntitlement, type EntitlementKey } from "../settings/entitlement-resolver";

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
  "feature-widget-owncast-live",
]);

export function renderWidgetPanelHost(features: Record<string, boolean>): string {
  const owncastEmbed = `
    <article class="panel-card owncast-card" data-testid="widget-panel-entry-feature-widget-owncast-live">
      <strong>Owncast live origin</strong>
      <p class="meta">Embedded player + live chat inside canopy pages with profile tuning.</p>
      <div class="owncast-controls">
        <label>Latency profile
          <select data-testid="owncast-latency-profile">
            <option value="normal">Normal</option>
            <option value="low">Low latency</option>
          </select>
        </label>
        <label>Playback profile
          <select data-testid="owncast-playback-profile">
            <option value="balanced">Balanced</option>
            <option value="quality">High quality</option>
            <option value="data_saver">Data saver</option>
          </select>
        </label>
      </div>
      <div class="owncast-embed-grid">
        <iframe
          title="Owncast player"
          class="owncast-embed"
          src="http://localhost:8080/embed/video"
          allow="autoplay; fullscreen; picture-in-picture"
          loading="lazy"
        ></iframe>
        <iframe
          title="Owncast live chat"
          class="owncast-embed"
          src="http://localhost:8080/embed/chat"
          loading="lazy"
        ></iframe>
      </div>
    </article>
  `;

  const widgetEntries = FEATURE_UI_ENTRIES.filter((entry) => {
    const [kind, uiEntryId] = entry.uiEntry.split(":");
    return kind === "widget_panel" && WIDGET_ENTRY_IDS.has(uiEntryId);
  });

  const rows = widgetEntries
    .map((entry) => {
      const [, uiEntryId] = entry.uiEntry.split(":");
      const enabled = resolveEntitlement({
        key: entry.presetKey as EntitlementKey,
        deploymentPreset: features,
      }).enabled;
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
      ${owncastEmbed}
      ${rows || '<p class="meta">No widget panel entries configured.</p>'}
    </section>
  `;
}
