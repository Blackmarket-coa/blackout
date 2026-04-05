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

export class BlackoutGovApp {
  constructor(private readonly root: HTMLElement, private readonly config: GovernanceRuntimeConfig) {}

  mount(): void {
    this.root.innerHTML = `
      <main class="gov-shell">
        <header class="gov-shell__header">
          <h1>Blackout Governance</h1>
          <p>Baseline governance UI shell for proposal, voting, and treasury workflows.</p>
        </header>

        <section class="gov-shell__card">
          <h2>Runtime configuration</h2>
          <dl>
            <div><dt>Homeserver</dt><dd>${this.config.homeserverUrl}</dd></div>
            <div><dt>Mode</dt><dd>${this.config.mode}</dd></div>
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
      </main>
    `;
  }
}
