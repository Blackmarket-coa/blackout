import { renderGlossaryTip } from "./glossary";
import type { GovernanceProposal } from "../types";

export type GovernanceRoomTab = "feed" | "proposals" | "taskboard";

interface GovernanceRoomPanelProps {
  channelId: string;
  channelLabel: string;
  activeTab: GovernanceRoomTab;
  showProposalModal: boolean;
  proposals: GovernanceProposal[];
  canPropose: boolean;
  canVote: boolean;
  governanceAdvancedEnabled: boolean;
  actionMessage?: string | null;
}

export function renderGovernanceRoomPanel({
  channelId,
  channelLabel,
  activeTab,
  showProposalModal,
  proposals,
  canPropose,
  canVote,
  governanceAdvancedEnabled,
  actionMessage = null,
}: GovernanceRoomPanelProps): string {
  const activeProposal = proposals.find((proposal) => proposal.status === "active") ?? proposals[0];

  return `
    <section class="governance-room" data-testid="governance-room-panel" data-channel-id="${channelId}">
      <header class="governance-room-header">
        <div>
          <h2>Governance Den · ${channelLabel}</h2>
          <p class="meta">Feed, proposals, and task board workflows for coalition decision-making. Create a proposal, cast votes, and read outcomes from Results.</p>
        </div>
        <button type="button" class="ghost-btn" data-action="governance-open-proposal" ${canPropose ? "" : "disabled aria-disabled='true'"} title="${canPropose ? "Create a new governance proposal" : "Proposal creation is currently unavailable"}">+ New Proposal</button>
      </header>
      <nav class="governance-tabs" aria-label="Governance den tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${activeTab === "feed"}" aria-controls="governance-panel-feed" id="governance-tab-feed" class="${activeTab === "feed" ? "is-active" : ""}" data-action="governance-set-tab" data-tab="feed">Decision feed</button>
        <button type="button" role="tab" aria-selected="${activeTab === "proposals"}" aria-controls="governance-panel-proposals" id="governance-tab-proposals" class="${activeTab === "proposals" ? "is-active" : ""}" data-action="governance-set-tab" data-tab="proposals">Proposal board</button>
        <button type="button" role="tab" aria-selected="${activeTab === "taskboard"}" aria-controls="governance-panel-taskboard" id="governance-tab-taskboard" class="${activeTab === "taskboard" ? "is-active" : ""}" data-action="governance-set-tab" data-tab="taskboard">Execution tasks</button>
      </nav>
      ${actionMessage ? `<p class="meta" role="status" data-testid="governance-action-message">${actionMessage}</p>` : ""}
      ${activeTab === "feed" ? renderFeedView(activeProposal, canVote, governanceAdvancedEnabled) : ""}
      ${activeTab === "proposals" ? renderProposalsView(proposals) : ""}
      ${activeTab === "taskboard" ? renderTaskBoardView() : ""}
      ${showProposalModal ? renderProposalModal(canPropose) : ""}
    </section>
  `;
}

function renderFeedView(
  activeProposal: GovernanceProposal | undefined,
  canVote: boolean,
  governanceAdvancedEnabled: boolean,
): string {
  const title = activeProposal?.title ?? "No active proposal";
  const timing = activeProposal ? `${activeProposal.durationHours}h voting window` : "Create one to start governance voting";

  return `
    <section class="governance-feed" data-testid="governance-feed-view" role="tabpanel" id="governance-panel-feed" aria-labelledby="governance-tab-feed">
      <article class="governance-proposal-pinned">
        <strong>Active proposal: ${title}</strong>
        <p class="meta">${timing}</p>
        <div class="governance-tally">
          <span class="for" style="width: 72%"></span>
          <span class="against" style="width: 18%"></span>
          <span class="abstain" style="width: 10%"></span>
        </div>
        <div class="governance-modal-actions">
          <button type="button" class="ghost-btn" data-action="governance-vote" data-vote="approve" ${canVote ? "" : "disabled aria-disabled='true'"} title="${canVote ? "Cast an approve vote" : "Voting is currently unavailable"}">Vote approve</button>
          <button type="button" class="ghost-btn" data-action="governance-vote" data-vote="block" ${canVote ? "" : "disabled aria-disabled='true'"} title="${canVote ? "Cast a block vote" : "Voting is currently unavailable"}">Vote block</button>
        </div>
      </article>
      <article class="governance-proposal-card governance-advanced-controls" data-testid="governance-advanced-controls">
        <h3>Advanced governance controls</h3>
        <p class="meta">Delegation, weighted voting, policy engine automation, and audit exports are paid features.</p>
        <label class="composer-popover-inline">
          <input type="checkbox" disabled ${governanceAdvancedEnabled ? "checked" : ""} />
          Advanced · Delegation
        </label>
        <label class="composer-popover-inline">
          <input type="checkbox" disabled ${governanceAdvancedEnabled ? "checked" : ""} />
          Advanced · Weighted voting
        </label>
        <label class="composer-popover-inline">
          <input type="checkbox" disabled ${governanceAdvancedEnabled ? "checked" : ""} />
          Advanced · Policy engine
        </label>
        <label class="composer-popover-inline">
          <input type="checkbox" disabled ${governanceAdvancedEnabled ? "checked" : ""} />
          Advanced · Audit exports
        </label>
        ${
          governanceAdvancedEnabled
            ? '<p class="meta">Advanced governance controls are enabled for this workspace.</p>'
            : '<p class="meta">Upgrade to unlock Advanced governance controls.</p><button type="button" class="ghost-btn" data-action="open-upgrade-flow" data-upgrade-source="governance_room_advanced_controls">Upgrade for Advanced governance</button>'
        }
      </article>
      <p class="meta">Discussion feed remains below with pinned proposal context above the timeline.</p>
    </section>
  `;
}

function renderProposalsView(proposals: GovernanceProposal[]): string {
  return `
    <section class="governance-proposals" data-testid="governance-proposals-view" role="tabpanel" id="governance-panel-proposals" aria-labelledby="governance-tab-proposals">
      ${
        proposals.length
          ? proposals
              .map(
                (proposal) =>
                  `<article class="governance-proposal-card"><h3>${proposal.title}</h3><p class="meta">Status: ${proposal.status} · Duration: ${proposal.durationHours}h</p></article>`,
              )
              .join("")
          : '<p class="meta">No proposals yet. Create one to start governance voting.</p>'
      }
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
    <section class="governance-taskboard" data-testid="governance-taskboard-view" role="tabpanel" id="governance-panel-taskboard" aria-labelledby="governance-tab-taskboard">
      ${columns
        .map(
          (column) => `<article class="governance-column"><h3>${column.title}</h3><div class="governance-task-card"><strong>${column.card}</strong><p class="meta">Assignee: coalition-ops · bounty: 150 credits</p></div></article>`,
        )
        .join("")}
    </section>
  `;
}

function renderProposalModal(canPropose: boolean): string {
  return `
    <div class="modal governance-modal" data-action="governance-close-proposal" role="presentation">
      <section class="modal-content governance-modal-card" role="dialog" aria-modal="true" aria-label="Create proposal">
        <header>
          <h3>Create Proposal</h3>
          <p class="meta">Title, vote type, duration, quorum, and attachments.</p>
        </header>
        <label>Title<input type="text" data-action="governance-proposal-title" value="Adopt quarterly roadmap" /></label>
        <label>Description<textarea rows="4" data-action="governance-proposal-description">Define budget and delivery goals for the next quarter.</textarea></label>
        <label>Vote type
          <select data-action="governance-proposal-vote-type">
            <option value="simple_majority">Simple majority</option>
            <option value="supermajority">Supermajority (2/3)</option>
            <option value="ranked_choice">Ranked choice</option>
            <option value="approval">Approval voting</option>
          </select>
        </label>
        <label>Duration<select data-action="governance-proposal-duration"><option value="48">48 hours</option><option value="168">7 days</option><option value="336">14 days</option></select></label>
        <label>Quorum ${renderGlossaryTip("Quorum")}<input type="number" min="1" max="100" value="60" data-action="governance-proposal-quorum" /></label>
        <div class="governance-modal-actions">
          <button type="button" class="ghost-btn" data-action="governance-close-proposal">Cancel</button>
          <button type="button" data-action="governance-create-proposal" ${canPropose ? "" : "disabled aria-disabled='true'"}>Create proposal</button>
        </div>
      </section>
    </div>
  `;
}
