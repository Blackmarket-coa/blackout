export type PlatformOpsTab = "federation" | "compliance" | "vault" | "hosting" | "blackbox" | "mobile";

interface PlatformOpsPanelProps {
  activeTab: PlatformOpsTab;
  readinessScore: number;
  vaultUsageGb: number;
  hostingTier: number;
  blackboxProvisioned: boolean;
  recommendationMode: "heuristic" | "matrix_public_rooms";
}

export function renderPlatformOpsPanel({ activeTab, readinessScore, vaultUsageGb, hostingTier, blackboxProvisioned, recommendationMode }: PlatformOpsPanelProps): string {
  return `
    <section class="stack panel-card platform-ops-panel" data-testid="platform-ops-panel">
      <h2>Platform, Compliance & Device Ops</h2>
      <nav class="ops-tabs" aria-label="Platform operations tabs">
        <button type="button" class="${activeTab === "federation" ? "is-active" : ""}" data-action="platform-tab" data-tab="federation">Federation</button>
        <button type="button" class="${activeTab === "compliance" ? "is-active" : ""}" data-action="platform-tab" data-tab="compliance">Compliance</button>
        <button type="button" class="${activeTab === "vault" ? "is-active" : ""}" data-action="platform-tab" data-tab="vault">Vault</button>
        <button type="button" class="${activeTab === "hosting" ? "is-active" : ""}" data-action="platform-tab" data-tab="hosting">Hosting</button>
        <button type="button" class="${activeTab === "blackbox" ? "is-active" : ""}" data-action="platform-tab" data-tab="blackbox">Blackbox</button>
        <button type="button" class="${activeTab === "mobile" ? "is-active" : ""}" data-action="platform-tab" data-tab="mobile">Mobile</button>
      </nav>
      ${activeTab === "federation" ? `<article class="ops-card"><strong>Live federation telemetry</strong><p class="meta">Recovery readiness: ${readinessScore}%</p><button type="button" data-action="platform-refresh-readiness">Refresh telemetry</button></article>` : ""}
      ${activeTab === "compliance" ? `<article class="ops-card"><strong>Steg voting & payroll compliance</strong><div class="ops-actions"><button type="button" data-action="compliance-toggle-secret-ballot">Toggle secret ballot</button><button type="button" data-action="compliance-open-audit-log">Open audit trail</button><button type="button" data-action="compliance-generate-1099">Generate 1099 batch</button></div></article>` : ""}
      ${activeTab === "vault" ? `<article class="ops-card"><strong>Encrypted media vault</strong><p class="meta">Usage: ${vaultUsageGb.toFixed(1)}GB / 50GB</p><div class="ops-actions"><button type="button" data-action="vault-upload-sim">Simulate upload</button><button type="button" data-action="vault-clear-sim">Clear usage</button></div></article>` : ""}
      ${activeTab === "hosting" ? `<article class="ops-card"><strong>Managed hosting controls</strong><p class="meta">Plan tier: ${hostingTier}</p><div class="ops-actions"><button type="button" data-action="hosting-scale-up">Scale up</button><button type="button" data-action="hosting-scale-down">Scale down</button><button type="button" data-action="hosting-trigger-backup">Trigger backup</button></div></article>` : ""}
      ${activeTab === "blackbox" ? `<article class="ops-card"><strong>Blackbox setup wizard</strong><p class="meta">Provisioned: ${blackboxProvisioned ? "yes" : "no"}</p><button type="button" data-action="blackbox-toggle-provisioning">Toggle provisioning</button></article>` : ""}
      ${activeTab === "mobile" ? `<article class="ops-card"><strong>Mobile discovery provider</strong><p class="meta">Recommendation mode: ${recommendationMode}</p><button type="button" data-action="mobile-toggle-recommendation">Switch provider</button></article>` : ""}
    </section>
  `;
}
