// ═══════════════════════════════════════════════════════
// BMC GOVERNANCE EVENTS
// Custom Matrix event types for cooperative governance.
// These extend the Matrix protocol with Blackout-specific
// proposal, voting, and delegation mechanics.
// ═══════════════════════════════════════════════════════

import type { MatrixClient } from "matrix-js-sdk";

// Custom event type identifiers
export const EventTypes = {
  PROPOSAL: "co.bmc.governance.proposal",
  VOTE: "co.bmc.governance.vote",
  DELEGATION: "co.bmc.governance.delegation",
  ROLE_ASSIGNMENT: "co.bmc.governance.role",
} as const;

// ── Proposals ──

export type ProposalStatus = "draft" | "active" | "passed" | "rejected" | "expired";

export type ProposalContent = {
  title: string;
  body: string;
  status: ProposalStatus;
  voting_method: "simple_majority" | "supermajority" | "consensus" | "ranked";
  quorum: number; // percentage (0-100)
  deadline: number; // unix timestamp
  created_by: string; // user ID
  tags?: string[];
};

export async function createProposal(
  client: MatrixClient,
  roomId: string,
  proposal: Omit<ProposalContent, "status" | "created_by">
) {
  return client.sendStateEvent(roomId, EventTypes.PROPOSAL as any, {
    ...proposal,
    status: "active",
    created_by: client.getUserId(),
  } as ProposalContent);
}

// ── Votes ──

export type VoteContent = {
  proposal_event_id: string;
  vote: "approve" | "reject" | "abstain";
  reason?: string;
  // For ranked choice
  rankings?: string[];
};

export async function castVote(
  client: MatrixClient,
  roomId: string,
  proposalEventId: string,
  vote: VoteContent["vote"],
  reason?: string
) {
  return client.sendEvent(roomId, EventTypes.VOTE as any, {
    proposal_event_id: proposalEventId,
    vote,
    reason,
  } as VoteContent);
}

// ── Delegation ──

export type DelegationContent = {
  delegate_to: string; // user ID
  scope: "all" | "room" | "tag";
  scope_value?: string; // room ID or tag name
  expires?: number; // unix timestamp
};

export async function delegateVote(
  client: MatrixClient,
  roomId: string,
  delegateTo: string,
  scope: DelegationContent["scope"] = "room"
) {
  return client.sendStateEvent(
    roomId,
    EventTypes.DELEGATION as any,
    {
      delegate_to: delegateTo,
      scope,
      scope_value: scope === "room" ? roomId : undefined,
    } as DelegationContent,
    client.getUserId()! // state key = delegator
  );
}
