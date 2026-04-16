export type EconomicsTab = "boosts" | "subscriptions" | "quests" | "marketplace";

interface EconomicsPanelProps {
  channelLabel: string;
  activeTab: EconomicsTab;
}

export function renderEconomicsPanel({ channelLabel, activeTab }: EconomicsPanelProps): string {
  return `
    <section class="economics-panel" data-testid="economics-panel">
      <header class="economics-panel-header">
        <h2>Coalition Economics · ${channelLabel}</h2>
        <p class="meta">Boosts, subscriptions, quests, and marketplace rails in one operator surface.</p>
      </header>
      <nav class="economics-tabs" aria-label="Economics tabs">
        <button type="button" class="${activeTab === "boosts" ? "is-active" : ""}" data-action="economics-set-tab" data-tab="boosts">Boosts</button>
        <button type="button" class="${activeTab === "subscriptions" ? "is-active" : ""}" data-action="economics-set-tab" data-tab="subscriptions">Subscriptions</button>
        <button type="button" class="${activeTab === "quests" ? "is-active" : ""}" data-action="economics-set-tab" data-tab="quests">Quests</button>
        <button type="button" class="${activeTab === "marketplace" ? "is-active" : ""}" data-action="economics-set-tab" data-tab="marketplace">Marketplace</button>
      </nav>
      ${activeTab === "boosts" ? renderBoostDashboard() : ""}
      ${activeTab === "subscriptions" ? renderSubscriptionsDashboard() : ""}
      ${activeTab === "quests" ? renderQuestBoard() : ""}
      ${activeTab === "marketplace" ? renderMarketplaceBridge() : ""}
    </section>
  `;
}

function renderBoostDashboard(): string {
  return `
    <section class="economics-grid" data-testid="economics-boosts-view">
      <article class="economics-card"><h3>Boost level</h3><p class="meta">Level 2 · 7/14 boosts to Level 3</p><progress max="14" value="7"></progress></article>
      <article class="economics-card"><h3>Perks unlocked</h3><ul><li>256kbps voice</li><li>100MB uploads</li><li>Animated Canopy icon</li></ul></article>
      <article class="economics-card"><h3>Current boosters</h3><p class="meta">@lina · @ops · @finance · @mesh</p></article>
    </section>
  `;
}

function renderSubscriptionsDashboard(): string {
  return `
    <section class="economics-grid" data-testid="economics-subscriptions-view">
      <article class="economics-card"><h3>Tier builder</h3><p class="meta">Supporter $5 · Member+ $12 · Patron $25</p></article>
      <article class="economics-card"><h3>Gated dens</h3><p class="meta">#insiders, #strategy, #townhall-recordings</p></article>
      <article class="economics-card"><h3>Paywall preview</h3><p class="meta">Branded card with den list + subscribe CTA.</p></article>
    </section>
  `;
}

function renderQuestBoard(): string {
  return `
    <section class="economics-grid" data-testid="economics-quests-view">
      <article class="economics-card"><h3>Open quests</h3><p class="meta">Design moderation playbook · 250 credits · 2/4 claims</p></article>
      <article class="economics-card"><h3>Pending review</h3><p class="meta">Townhall incident drill evidence packet</p></article>
      <article class="economics-card"><h3>Credits wallet</h3><p class="meta">Balance: 1,420 credits · Redeem via marketplace bridge</p></article>
    </section>
  `;
}

function renderMarketplaceBridge(): string {
  return `
    <section class="economics-grid" data-testid="economics-marketplace-view">
      <article class="economics-card"><h3>Product card</h3><p class="meta">Mesh monitoring template · $29 · Buy now</p></article>
      <article class="economics-card"><h3>Seller tools</h3><p class="meta">Inventory manager, payouts, encrypted delivery links</p></article>
      <article class="economics-card"><h3>Den policy</h3><p class="meta">Marketplace enabled for trusted seller role only.</p></article>
    </section>
  `;
}
