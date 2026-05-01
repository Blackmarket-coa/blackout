import type { GovernanceRuntimeConfig } from "./config";

export interface DelegationRow {
  delegateId: string;
  fromLabel: string;
  weight: number;
}

export interface TreasuryTx {
  id: string;
  label: string;
  amount: string;
  direction: "in" | "out";
}

export interface DelegationData {
  total: number;
  rows?: ReadonlyArray<DelegationRow>;
}

export interface TreasuryData {
  balance: string;
  pendingDisbursements?: number;
  recentTxs?: ReadonlyArray<TreasuryTx>;
}

export interface AnalyticsData {
  activeProposals: number;
  participationLast30d: string;
  quorumRate?: string;
}

export type ProposalState = "open" | "passed" | "rejected" | "expired";

export interface ProposalSummary {
  id: string;
  title: string;
  voteType: "simple_majority" | "supermajority" | "ranked_choice";
  state: ProposalState;
}

export interface GovernanceData {
  treasury?: TreasuryData;
  delegations?: DelegationData;
  analytics?: AnalyticsData;
  activeProposal?: ProposalSummary;
  recentProposals?: ReadonlyArray<ProposalSummary>;
}

export type GovernanceShellView = "default" | "simplified";

export interface GovernanceShellOptions {
  view?: GovernanceShellView;
  data?: GovernanceData;
}

const DEFAULT_DATA: Required<Pick<GovernanceData, "treasury" | "delegations" | "analytics">> = {
  treasury: { balance: "142,300 BMC" },
  delegations: { total: 58 },
  analytics: { activeProposals: 7, participationLast30d: "81%" },
};

const DEFAULT_ACTIVE_PROPOSAL_TITLE = "Adopt rotating incident commander schedule.";

const GOVERNANCE_CAPABILITIES = [
  {
    title: "Proposal creation",
    description: "Create governance proposals with typed templates and quorum requirements.",
    status: "ready",
  },
  {
    title: "Voting interface",
    description: "Cast approve/block votes with attestation-friendly metadata.",
    status: "ready",
  },
  {
    title: "Delegation and treasury",
    description: "Track delegated voting power and treasury decisions in one panel.",
    status: "ready",
  },
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export class BlackoutGovApp {
  constructor(
    private readonly root: HTMLElement,
    private readonly config: GovernanceRuntimeConfig,
    private readonly options: GovernanceShellOptions = {},
  ) {}

  mount(): void {
    this.root.innerHTML = renderGovernanceShell(this.config, this.options);
  }
}

export function renderGovernanceShell(
  config: GovernanceRuntimeConfig,
  options: GovernanceShellOptions = {},
): string {
  const view = options.view ?? "default";
  const data = options.data ?? {};

  if (view === "simplified") {
    return renderSimplifiedShell(data);
  }

  return renderDefaultShell(config, data);
}

function renderDefaultShell(config: GovernanceRuntimeConfig, data: GovernanceData): string {
  const treasury = data.treasury ?? DEFAULT_DATA.treasury;
  const delegations = data.delegations ?? DEFAULT_DATA.delegations;
  const analytics = data.analytics ?? DEFAULT_DATA.analytics;
  const activeProposal = data.activeProposal;

  const stats = [
    { label: "Active proposals", value: String(analytics.activeProposals), testid: "analytics-active-proposals" },
    { label: "Treasury balance", value: treasury.balance, testid: "treasury-balance" },
    { label: "Delegations tracked", value: String(delegations.total), testid: "delegations-total" },
    { label: "Participation (30d)", value: analytics.participationLast30d, testid: "analytics-participation" },
  ];

  if (analytics.quorumRate) {
    stats.push({ label: "Quorum rate", value: analytics.quorumRate, testid: "analytics-quorum-rate" });
  }
  if (typeof treasury.pendingDisbursements === "number") {
    stats.push({
      label: "Pending disbursements",
      value: String(treasury.pendingDisbursements),
      testid: "treasury-pending-disbursements",
    });
  }

  return `
      <main class="gov-shell" data-view="default">
        <header class="gov-shell__header">
          <h1>Blackout Governance</h1>
          <p>Baseline governance UI shell for proposal, voting, and treasury workflows.</p>
        </header>

        <section class="gov-shell__card">
          <h2>Runtime configuration</h2>
          <dl>
            <div><dt>Homeserver</dt><dd>${escapeHtml(config.homeserverUrl)}</dd></div>
            <div><dt>Mode</dt><dd>${escapeHtml(config.mode)}</dd></div>
          </dl>
        </section>

        <section class="gov-shell__card">
          <h2>Feature baseline</h2>
          <ul>
            ${GOVERNANCE_CAPABILITIES.map(
              (item) => `
                <li>
                  <strong>${item.title}</strong>
                  <p>${item.description}</p>
                  <span class="gov-shell__status">${item.status}</span>
                </li>
              `,
            ).join("")}
          </ul>
        </section>

        <section class="gov-shell__grid">
          <article class="gov-shell__card">
            <h2>Proposal creation UI</h2>
            <label>Title<input data-testid="proposal-title" type="text" value="Approve Q2 resiliency budget" /></label>
            <label>Vote type
              <select data-testid="proposal-vote-type">
                <option>simple_majority</option>
                <option>supermajority</option>
                <option>ranked_choice</option>
              </select>
            </label>
            <label>Duration
              <select data-testid="proposal-duration">
                <option>48 hours</option>
                <option>7 days</option>
              </select>
            </label>
            <button type="button" data-action="proposal-create">Create proposal</button>
          </article>

          <article class="gov-shell__card" data-testid="voting-card">
            <h2>Voting interface</h2>
            <p class="meta" data-testid="active-proposal-title">Proposal: ${escapeHtml(activeProposal?.title ?? DEFAULT_ACTIVE_PROPOSAL_TITLE)}</p>
            <div class="gov-shell__actions">
              <button type="button" data-action="vote-approve">Approve</button>
              <button type="button" data-action="vote-block">Block</button>
              <button type="button" data-action="vote-abstain">Abstain</button>
            </div>
          </article>

          <article class="gov-shell__card">
            <h2>Meeting scheduler UI</h2>
            <label>Meeting name<input data-testid="meeting-name" type="text" value="Weekly governance sync" /></label>
            <label>Start time<input data-testid="meeting-start" type="datetime-local" value="2026-04-12T16:00" /></label>
            <label>Duration (minutes)<input data-testid="meeting-duration" type="number" value="60" min="15" /></label>
            <button type="button" data-action="meeting-schedule">Schedule meeting</button>
          </article>
        </section>

        <section class="gov-shell__card" data-testid="ops-surface">
          <h2>P2 operations surface</h2>
          <div class="gov-shell__stats">
            ${stats
              .map(
                (item) =>
                  `<article data-testid="${item.testid}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></article>`,
              )
              .join("")}
          </div>
          ${renderDelegationList(delegations)}
          ${renderTreasuryFeed(treasury)}
          <p class="meta">Delegation, treasury, and analytics primitives are now wired through GovernanceData; defaults render when no live data is supplied.</p>
        </section>
      </main>
    `;
}

function renderSimplifiedShell(data: GovernanceData): string {
  const activeProposal = data.activeProposal;
  const recentProposals = data.recentProposals ?? [];

  return `
      <main class="gov-shell gov-shell--simplified" data-view="simplified">
        <header class="gov-shell__header">
          <h1>Blackout Governance</h1>
          <p>Simplified view — vote on the current proposal.</p>
        </header>

        <section class="gov-shell__card" data-testid="simplified-voting-card">
          <h2>Current proposal</h2>
          <p class="meta" data-testid="active-proposal-title">${escapeHtml(activeProposal?.title ?? DEFAULT_ACTIVE_PROPOSAL_TITLE)}</p>
          <div class="gov-shell__actions">
            <button type="button" data-action="vote-approve">Approve</button>
            <button type="button" data-action="vote-block">Block</button>
            <button type="button" data-action="vote-abstain">Abstain</button>
          </div>
        </section>

        ${
          recentProposals.length > 0
            ? `
        <section class="gov-shell__card" data-testid="simplified-recent-decisions">
          <h2>Recent decisions</h2>
          <ul class="gov-shell__decision-list">
            ${recentProposals
              .map(
                (proposal) => `
                  <li data-testid="recent-proposal-${escapeHtml(proposal.id)}">
                    <strong>${escapeHtml(proposal.title)}</strong>
                    <span class="gov-shell__status gov-shell__status--${escapeHtml(proposal.state)}">${escapeHtml(proposal.state)}</span>
                  </li>
                `,
              )
              .join("")}
          </ul>
        </section>
        `
            : ""
        }
      </main>
    `;
}

function renderDelegationList(delegations: DelegationData): string {
  const rows = delegations.rows ?? [];
  if (rows.length === 0) return "";

  return `
          <section class="gov-shell__sub" data-testid="delegation-list">
            <h3>Active delegations</h3>
            <ul class="gov-shell__delegation-rows">
              ${rows
                .map(
                  (row) => `
                    <li data-testid="delegation-row-${escapeHtml(row.delegateId)}">
                      <strong>${escapeHtml(row.fromLabel)}</strong>
                      <span>→ ${escapeHtml(row.delegateId)}</span>
                      <em>weight ${row.weight}</em>
                    </li>
                  `,
                )
                .join("")}
            </ul>
          </section>
  `;
}

function renderTreasuryFeed(treasury: TreasuryData): string {
  const txs = treasury.recentTxs ?? [];
  if (txs.length === 0) return "";

  return `
          <section class="gov-shell__sub" data-testid="treasury-feed">
            <h3>Recent treasury activity</h3>
            <ul class="gov-shell__tx-rows">
              ${txs
                .map(
                  (tx) => `
                    <li data-testid="treasury-tx-${escapeHtml(tx.id)}" data-direction="${escapeHtml(tx.direction)}">
                      <strong>${escapeHtml(tx.label)}</strong>
                      <span>${escapeHtml(tx.amount)}</span>
                    </li>
                  `,
                )
                .join("")}
            </ul>
          </section>
  `;
}
