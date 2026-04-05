import type { GovernanceRuntimeConfig } from "./config";

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

const TREASURY_SNAPSHOTS = [
  { label: "Active proposals", value: "7" },
  { label: "Treasury balance", value: "142,300 BMC" },
  { label: "Delegations tracked", value: "58" },
  { label: "Participation (30d)", value: "81%" },
] as const;

export class BlackoutGovApp {
  constructor(private readonly root: HTMLElement, private readonly config: GovernanceRuntimeConfig) {}

  mount(): void {
    this.root.innerHTML = renderGovernanceShell(this.config);
  }
}

export function renderGovernanceShell(config: GovernanceRuntimeConfig): string {
  return `
      <main class="gov-shell">
        <header class="gov-shell__header">
          <h1>Blackout Governance</h1>
          <p>Baseline governance UI shell for proposal, voting, and treasury workflows.</p>
        </header>

        <section class="gov-shell__card">
          <h2>Runtime configuration</h2>
          <dl>
            <div><dt>Homeserver</dt><dd>${config.homeserverUrl}</dd></div>
            <div><dt>Mode</dt><dd>${config.mode}</dd></div>
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

          <article class="gov-shell__card">
            <h2>Voting interface</h2>
            <p class="meta">Proposal: Adopt rotating incident commander schedule.</p>
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

        <section class="gov-shell__card">
          <h2>P2 operations surface</h2>
          <div class="gov-shell__stats">
            ${TREASURY_SNAPSHOTS.map((item) => `<article><span>${item.label}</span><strong>${item.value}</strong></article>`).join("")}
          </div>
          <p class="meta">Delegation, treasury, and analytics primitives are now visible in the baseline shell for incremental wiring.</p>
        </section>
      </main>
    `;
}
