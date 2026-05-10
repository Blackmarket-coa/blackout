import type { EventEnvelope } from '../common/types';

export const GOVERNANCE_PROTOCOL_VERSION = 1 as const;

export const GOVERNANCE_EVENT_NAMES = {
    proposal: 'co.bmc.proposal',
    vote: 'co.bmc.vote',
    meeting: 'co.bmc.governance.meeting',
    treasurySnapshot: 'co.bmc.governance.treasury.snapshot',
} as const;

export type GovernanceEventName =
    (typeof GOVERNANCE_EVENT_NAMES)[keyof typeof GOVERNANCE_EVENT_NAMES];

export interface GovernanceProposalOption {
    id: string;
    label: string;
}

/**
 * Proposal type union.
 *
 * `'consent'` is the sociocratic primitive: rather than tallying for/against
 * votes, consent proposals collect three reactions on the proposal event
 * itself — 🌱 (safe to try), 🌾 (concern, opens an inline note), and 🪨
 * (paramount objection, opens a structured "what harm?" form). The other
 * types remain shipped and selectable; playbooks pick the default.
 *
 * Vocabulary cross-reference: Loomio's "advice / consent / consensus" copy
 * pattern. We start with consent as the v1 sociocratic surface; consensus and
 * advice are deferred to v2 along with their UI affordances.
 */
export type GovernanceProposalType = 'binary' | 'multiple_choice' | 'ranked' | 'consent';
export type GovernanceProposalStatus = 'active' | 'passed' | 'failed' | 'cancelled';

export interface GovernanceProposalPayload {
    title: string;
    description: string;
    type: GovernanceProposalType;
    /**
     * Options array. Empty for consent proposals (the reaction palette
     * carries the choices); required and non-empty for binary/multiple-choice
     * /ranked.
     */
    options: GovernanceProposalOption[];
    quorum: number;
    deadline: string;
    eligibility: 'all' | `role:${string}` | `power:${string}`;
    status: GovernanceProposalStatus;
}

export interface GovernanceVotePayload {
    proposalEventId: string;
    choice: string | string[];
}

export type GovernanceProposalEvent = EventEnvelope<'blackout.governance.proposal.created', GovernanceProposalPayload>;
export type GovernanceVoteEvent = EventEnvelope<'blackout.governance.vote.cast', GovernanceVotePayload>;

export type GovernanceMeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface GovernanceMeetingAttendeeRef {
    /** Matrix user id (`@user:server`) or role identifier (`role:moderator`). */
    id: string;
    /** Optional display label. Renderers should fall back to `id` when omitted. */
    label?: string;
}

export interface GovernanceMeetingPayload {
    /** Stable id for the meeting. Required so updates can reconcile. */
    meetingId: string;
    /** Short human-readable title. */
    title: string;
    /** ISO-8601 start timestamp. */
    startsAt: string;
    /** ISO-8601 end timestamp. Must be strictly greater than `startsAt`. */
    endsAt: string;
    /** Free-form agenda or description. */
    agenda?: string;
    /** Conference URL or matrix room alias for the call. */
    location?: string;
    /** Subjects expected to attend; receivers may use this for invites. */
    attendees: GovernanceMeetingAttendeeRef[];
    /** Optional governance proposal the meeting is bound to. */
    relatedProposalId?: string;
    status: GovernanceMeetingStatus;
}

export interface GovernanceTreasurySnapshotLine {
    /** Asset symbol (e.g. `USDC`, `BTC`, `XMR`) or proprietary ledger code. */
    asset: string;
    /** Total balance for the asset, encoded as a string to preserve precision. */
    balance: string;
    /** Optional 24h delta as a string for the same precision-safety reason. */
    delta24h?: string;
}

export interface GovernanceTreasurySnapshotPayload {
    /** Stable id for the snapshot. */
    snapshotId: string;
    /** ISO-8601 timestamp the snapshot was generated for. */
    generatedAt: string;
    /** Per-asset balances. Order is preserved by receivers for display. */
    lines: GovernanceTreasurySnapshotLine[];
    /** Optional total in a fiat reference (e.g. USD); same string-precision rule. */
    totalReference?: { currency: string; amount: string };
}

export type GovernanceMeetingScheduledEvent = EventEnvelope<
    'blackout.governance.meeting.scheduled',
    GovernanceMeetingPayload
>;

export type GovernanceTreasurySnapshotPublishedEvent = EventEnvelope<
    'blackout.governance.treasury.snapshot.published',
    GovernanceTreasurySnapshotPayload
>;

export interface GovernanceProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof GOVERNANCE_PROTOCOL_VERSION;
    eventNames: typeof GOVERNANCE_EVENT_NAMES;
    policy: 'additive-only-minor';
}

export const GOVERNANCE_PROTOCOL_SURFACE: GovernanceProtocolSurface = {
    owner: '@blackout/protocol',
    version: GOVERNANCE_PROTOCOL_VERSION,
    eventNames: GOVERNANCE_EVENT_NAMES,
    policy: 'additive-only-minor',
};
