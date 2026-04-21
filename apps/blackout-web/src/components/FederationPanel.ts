import { renderGlossaryTip } from "./glossary";

export type FederationTab = "health" | "snapshots" | "recovery";

interface FederationPanelProps {
  channelLabel: string;
  activeTab: FederationTab;
}

export function renderFederationPanel({ channelLabel, activeTab }: FederationPanelProps): string {
  return `
    <section class="federation-panel" data-testid="federation-panel">
      <header class="federation-panel-header">
        <h2>Federation Health ${renderGlossaryTip("Federation")} · ${channelLabel}</h2>
        <p class="meta">Mesh status, snapshots, and recovery readiness for self-healing operations.</p>
      </header>
      <nav class="federation-tabs" aria-label="Federation tabs">
        <button type="button" class="${activeTab === "health" ? "is-active" : ""}" data-action="federation-set-tab" data-tab="health">Node Map</button>
        <button type="button" class="${activeTab === "snapshots" ? "is-active" : ""}" data-action="federation-set-tab" data-tab="snapshots">Snapshots</button>
        <button type="button" class="${activeTab === "recovery" ? "is-active" : ""}" data-action="federation-set-tab" data-tab="recovery">Recovery</button>
      </nav>
      ${activeTab === "health" ? renderHealthView() : ""}
      ${activeTab === "snapshots" ? renderSnapshotsView() : ""}
      ${activeTab === "recovery" ? renderRecoveryView() : ""}
    </section>
  `;
}

function renderHealthView(): string {
  return `
    <section class="federation-grid" data-testid="federation-health-view">
      <article class="federation-card"><h3>Recovery readiness</h3><strong>86%</strong><p class="meta">Based on peer count, snapshot freshness, replication coverage.</p></article>
      <article class="federation-card"><h3>Node map</h3><p class="meta">bmc-core ↔ mesh-east ↔ mesh-west · latency mostly &lt;100ms</p></article>
      <article class="federation-card"><h3>Peer list</h3><p class="meta">3 peers online · last sync 42s ago · replicated 98%</p></article>
    </section>
  `;
}

function renderSnapshotsView(): string {
  return `
    <section class="federation-grid" data-testid="federation-snapshots-view">
      <article class="federation-card"><h3>Timeline</h3><p class="meta">30-day snapshot history with daily checkpoints.</p></article>
      <article class="federation-card"><h3>Latest snapshot</h3><p class="meta">2.4 GB · CRDT v5 · 214 dens included</p></article>
      <article class="federation-card"><h3>Drift alerts</h3><p class="meta">No drift alerts in last 7 days.</p></article>
    </section>
  `;
}

function renderRecoveryView(): string {
  return `
    <section class="federation-grid" data-testid="federation-recovery-view">
      <article class="federation-card"><h3>Reconnecting banner</h3><p class="meta">“Reconnecting via federation mesh…”</p></article>
      <article class="federation-card"><h3>Completion banner</h3><p class="meta">“Connection restored. All messages synced.”</p></article>
      <article class="federation-card"><h3>Admin system den</h3><p class="meta">#federation-health gets automatic recovery reports.</p></article>
    </section>
  `;
}
