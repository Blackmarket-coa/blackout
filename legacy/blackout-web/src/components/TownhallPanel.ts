export type TownhallMode = "standard" | "townhall";

interface TownhallPanelProps {
  channelLabel: string;
  mode: TownhallMode;
}

export function renderTownhallPanel({ channelLabel, mode }: TownhallPanelProps): string {
  return `
    <section class="townhall-panel" data-testid="townhall-panel">
      <header class="townhall-header">
        <h2>Townhall Call · ${channelLabel}</h2>
        <p class="meta">SFU-ready governance call surface with stage, queue, and vote overlay.</p>
      </header>
      <div class="townhall-mode-toggle" role="tablist" aria-label="Call mode">
        <button type="button" class="${mode === "standard" ? "is-active" : ""}" data-action="townhall-set-mode" data-mode="standard">Standard (≤8)</button>
        <button type="button" class="${mode === "townhall" ? "is-active" : ""}" data-action="townhall-set-mode" data-mode="townhall">Townhall (50+)</button>
      </div>
      ${mode === "standard" ? renderStandardMode() : renderTownhallMode()}
    </section>
  `;
}

function renderStandardMode(): string {
  return `
    <section class="townhall-grid" data-testid="townhall-standard-view">
      <article class="townhall-card"><h3>Peer call</h3><p class="meta">MatrixRTC peer mode up to 8 participants.</p></article>
      <article class="townhall-card"><h3>Controls</h3><p class="meta">Mute, camera, screen share, hand raise.</p></article>
    </section>
  `;
}

function renderTownhallMode(): string {
  return `
    <section class="townhall-grid" data-testid="townhall-sfu-view">
      <article class="townhall-card"><h3>Speaker stage</h3><p class="meta">Top 4 active speakers with teal highlight border.</p></article>
      <article class="townhall-card"><h3>Speaker queue</h3><p class="meta">Raised-hand queue with reorder/skip controls.</p></article>
      <article class="townhall-card"><h3>Live vote overlay</h3><p class="meta">In-call proposal card with realtime tally updates.</p></article>
      <article class="townhall-card"><h3>Recording consent</h3><p class="meta">Consent-required recording indicator and join prompt.</p></article>
    </section>
  `;
}
