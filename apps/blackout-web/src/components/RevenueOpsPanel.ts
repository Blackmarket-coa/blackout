export type RevenueOpsTab = "monetization" | "quests" | "marketplace" | "apps";
export type QuestStage = "open" | "claimed" | "submitted" | "approved";

interface RevenueOpsPanelProps {
  activeTab: RevenueOpsTab;
  paymentSheetOpen: boolean;
  paymentIssue: boolean;
  questStage: QuestStage;
  installedApps: number;
}

export function renderRevenueOpsPanel({ activeTab, paymentSheetOpen, paymentIssue, questStage, installedApps }: RevenueOpsPanelProps): string {
  return `
    <section class="stack panel-card revenue-ops-panel" data-testid="revenue-ops-panel">
      <h2>Revenue & Marketplace Ops</h2>
      <nav class="ops-tabs" aria-label="Revenue operations tabs">
        <button type="button" class="${activeTab === "monetization" ? "is-active" : ""}" data-action="revenue-tab" data-tab="monetization">Monetization</button>
        <button type="button" class="${activeTab === "quests" ? "is-active" : ""}" data-action="revenue-tab" data-tab="quests">Quests</button>
        <button type="button" class="${activeTab === "marketplace" ? "is-active" : ""}" data-action="revenue-tab" data-tab="marketplace">Marketplace</button>
        <button type="button" class="${activeTab === "apps" ? "is-active" : ""}" data-action="revenue-tab" data-tab="apps">App Marketplace</button>
      </nav>
      ${activeTab === "monetization" ? `
        <article class="ops-card">
          <strong>Paywall enforcement preview</strong>
          <p class="meta">Gate #insiders and #strategy behind Supporter/Member+ tiers.</p>
          ${paymentIssue ? '<p class="meta">Grace period active: 3 days remaining.</p>' : ""}
          <div class="ops-actions">
            <button type="button" data-action="revenue-open-payment-sheet">Open payment sheet</button>
            <button type="button" data-action="revenue-toggle-payment-issue">Toggle payment issue</button>
          </div>
          ${paymentSheetOpen ? '<div class="ops-inline-sheet"><strong>Stripe payment sheet</strong><p class="meta">Card • Wallet • Bank</p><button type="button" data-action="revenue-close-payment-sheet">Close</button></div>' : ""}
        </article>
      ` : ""}
      ${activeTab === "quests" ? `
        <article class="ops-card">
          <strong>Quest lifecycle</strong>
          <p class="meta">Current quest status: <span data-testid="quest-stage">${questStage}</span></p>
          <div class="ops-actions">
            <button type="button" data-action="quest-next-stage">Advance stage</button>
            <button type="button" data-action="quest-reset-stage">Reset</button>
          </div>
          <p class="meta">Flow: open → claimed → submitted → approved (wallet payout).</p>
        </article>
      ` : ""}
      ${activeTab === "marketplace" ? `
        <article class="ops-card">
          <strong>Marketplace bridge</strong>
          <p class="meta">Product card + encrypted delivery link + role-gated seller policy.</p>
          <div class="ops-actions">
            <button type="button" data-action="marketplace-open-product-modal">New product listing</button>
            <button type="button" data-action="marketplace-open-checkout">Open checkout sheet</button>
          </div>
        </article>
      ` : ""}
      ${activeTab === "apps" ? `
        <article class="ops-card">
          <strong>Governance app marketplace</strong>
          <p class="meta">Installed apps: <span data-testid="installed-app-count">${installedApps}</span></p>
          <div class="ops-actions">
            <button type="button" data-action="app-install">Install app</button>
            <button type="button" data-action="app-uninstall">Uninstall app</button>
            <button type="button" data-action="app-permissions">Review permissions</button>
          </div>
        </article>
      ` : ""}
    </section>
  `;
}
