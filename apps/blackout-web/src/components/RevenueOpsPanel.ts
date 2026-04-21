import { BLACKOUT_THEMES, type BlackoutThemeId } from "@blackout/core";

export type RevenueOpsTab = "monetization" | "quests" | "marketplace" | "apps";
export type QuestStage = "open" | "claimed" | "submitted" | "approved";
export type FunnelFamily = "stego" | "governance";

export interface RevenueFunnelMetric {
  family: FunnelFamily;
  baselineUsage: number;
  advancedControlOpens: number;
  upgradeClicks: number;
  conversions: number;
}

interface RevenueOpsPanelProps {
  activeTab: RevenueOpsTab;
  paymentSheetOpen: boolean;
  paymentIssue: boolean;
  questStage: QuestStage;
  installedApps: number;
  funnelMetrics: RevenueFunnelMetric[];
  selectedTheme: BlackoutThemeId;
}

function conversionRate(metric: RevenueFunnelMetric): string {
  if (metric.upgradeClicks <= 0) return "0%";
  return `${Math.round((metric.conversions / metric.upgradeClicks) * 100)}%`;
}

export function renderRevenueOpsPanel({
  activeTab,
  paymentSheetOpen,
  paymentIssue,
  questStage,
  installedApps,
  funnelMetrics,
  selectedTheme,
}: RevenueOpsPanelProps): string {
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
        <article class="ops-card" data-testid="revenue-funnel-slice">
          <strong>Free-to-paid funnel by feature family</strong>
          <p class="meta">Tracks baseline usage, advanced-control opens, upgrade clicks, and paid conversions.</p>
          <div class="upgrade-prompt-table">
            <table>
              <thead>
                <tr><th>Family</th><th>Baseline</th><th>Advanced opens</th><th>Upgrade clicks</th><th>Conversions</th><th>Click→paid</th></tr>
              </thead>
              <tbody>
                ${funnelMetrics.map((metric) => `
                  <tr data-testid="funnel-row-${metric.family}">
                    <td>${metric.family}</td>
                    <td>${metric.baselineUsage}</td>
                    <td>${metric.advancedControlOpens}</td>
                    <td>${metric.upgradeClicks}</td>
                    <td>${metric.conversions}</td>
                    <td>${conversionRate(metric)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </article>
        <article class="ops-card" data-testid="revenue-theme-bundles">
          <strong>BMC theme bundles</strong>
          <p class="meta">Current theme: <span data-testid="revenue-current-theme">${selectedTheme}</span></p>
          <p class="meta">Monetize premium appearance packs without fragmenting the core monetization module.</p>
          <div class="ops-actions">
            <button type="button" data-action="theme-bundle-open-catalog">Open theme catalog</button>
          </div>
          <p class="meta">${BLACKOUT_THEMES.map((theme) => theme.label).join(" · ")}</p>
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
