export type GovernanceRoomTab = "feed" | "proposals" | "taskboard";

interface GovernanceRoomPanelProps {
  channelLabel: string;
  activeTab: GovernanceRoomTab;
  showProposalModal: boolean;
}

export function renderGovernanceRoomPanel({ channelLabel, activeTab, showProposalModal }: GovernanceRoomPanelProps): string {
  return `
    <section class="governance-room" data-testid="governance-room-panel">
      <header class="governance-room-header">
        <div>
          <h2>Governance Room · ${channelLabel}</h2>
          <p class="meta">Feed, proposals, and task board workflows for coalition decision-making.</p>
        </div>
        <button type="button" class="ghost-btn" data-action="governance-open-proposal">+ New Proposal</button>
      </header>
      <nav class="governance-tabs" aria-label="Governance room tabs">
        <button type="button" class="${activeTab === "feed" ? "is-active" : ""}" data-action="governance-set-tab" data-tab="feed">Feed</button>
        <button type="button" class="${activeTab === "proposals" ? "is-active" : ""}" data-action="governance-set-tab" data-tab="proposals">Proposals</button>
        <button type="button" class="${activeTab === "taskboard" ? "is-active" : ""}" data-action="governance-set-tab" data-tab="taskboard">Task Board</button>
      </nav>
      ${activeTab === "feed" ? renderFeedView() : ""}
      ${activeTab === "proposals" ? renderProposalsView() : ""}
      ${activeTab === "taskboard" ? renderTaskBoardView() : ""}
      ${showProposalModal ? renderProposalModal() : ""}
    </section>
  `;
}

function renderFeedView(): string {
  return `
    <section class="governance-feed" data-testid="governance-feed-view">
      <article class="governance-proposal-pinned">
        <strong>Active proposal: Adopt coalition sprint budget</strong>
        <p class="meta">For 18 · Against 3 · Abstain 2 · closes in 18h</p>
        <div class="governance-tally">
          <span class="for" style="width: 72%"></span>
          <span class="against" style="width: 18%"></span>
          <span class="abstain" style="width: 10%"></span>
        </div>
      </article>
      <p class="meta">Discussion feed remains below with pinned proposal context above the timeline.</p>
    </section>
  `;
}

function renderProposalsView(): string {
  return `
    <section class="governance-proposals" data-testid="governance-proposals-view">
      <article class="governance-proposal-card"><h3>Rotate treasury signers</h3><p class="meta">Status: Active · Deadline: 14h</p></article>
      <article class="governance-proposal-card"><h3>Approve outreach grant</h3><p class="meta">Status: Passed · Deadline: Closed</p></article>
      <article class="governance-proposal-card"><h3>Enable marketplace bridge</h3><p class="meta">Status: Rejected · Deadline: Closed</p></article>
    </section>
  `;
}

function renderTaskBoardView(): string {
  const columns = [
    { title: "Backlog", card: "Draft election policy" },
    { title: "In Progress", card: "Review contributor payouts" },
    { title: "Review", card: "Townhall moderation spec" },
    { title: "Done", card: "Publish membership charter" },
  ];

  return `
    <section class="governance-taskboard" data-testid="governance-taskboard-view">
      ${columns
        .map(
          (column) => `<article class="governance-column"><h3>${column.title}</h3><div class="governance-task-card"><strong>${column.card}</strong><p class="meta">Assignee: coalition-ops · bounty: 150 credits</p></div></article>`,
        )
        .join("")}
    </section>
  `;
}

function renderProposalModal(): string {
  return `
    <div class="modal governance-modal" data-action="governance-close-proposal" role="presentation">
      <section class="modal-content governance-modal-card" role="dialog" aria-modal="true" aria-label="Create proposal">
        <header>
          <h3>Create Proposal</h3>
          <p class="meta">Title, vote type, duration, quorum, and attachments.</p>
        </header>
        <label>Title<input type="text" value="Adopt quarterly roadmap" /></label>
        <label>Description<textarea rows="4">Define budget and delivery goals for the next quarter.</textarea></label>
        <label>Vote type
          <select>
            <option>Simple majority</option>
            <option>Supermajority (2/3)</option>
            <option>Ranked choice</option>
            <option>Approval voting</option>
          </select>
        </label>
        <label>Duration<select><option>48 hours</option><option>7 days</option><option>14 days</option></select></label>
        <label>Quorum<input type="number" min="1" max="100" value="60" /></label>
        <div class="governance-modal-actions">
          <button type="button" class="ghost-btn" data-action="governance-close-proposal">Cancel</button>
          <button type="button">Create proposal</button>
        </div>
      </section>
    </div>
  `;
}
