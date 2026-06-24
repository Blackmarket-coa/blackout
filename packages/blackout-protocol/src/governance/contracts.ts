import type { EventEnvelope } from '../common/types';
import type { PlaybookAccentToken } from '../playbook/contracts';

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

/**
 * A treasury milestone is a shared, cooperative *goal* the community advances
 * toward — "fund the commons treasury to 50,000 USDC". It overlays the
 * existing treasury snapshots: the milestone supplies the target, the latest
 * snapshot's per-asset balance supplies the current value, and the two render
 * as a "community thermometer".
 *
 * Banlist posture (System 5): this is a collective *goal*, not an individual
 * status. Progress is the treasury balance vs. a target — there is no
 * per-member contribution attribution or ranking here at all.
 */
export const TREASURY_MILESTONE_STATUSES = ['active', 'met', 'archived'] as const;
export type TreasuryMilestoneStatus = (typeof TREASURY_MILESTONE_STATUSES)[number];

export interface GovernanceTreasuryMilestonePayload {
    /** Stable id. */
    milestoneId: string;
    /** Short human-readable goal, e.g. "Seed the mutual-aid fund". */
    title: string;
    /** Asset whose snapshot balance measures progress, e.g. "USDC". */
    asset: string;
    /**
     * Target balance, as a number for thermometer math. Treasury balances are
     * string-encoded for precision on the snapshot; the milestone target is a
     * display goal, so a number is sufficient. Must be > 0.
     */
    target: number;
    status: TreasuryMilestoneStatus;
    /** Optional accent token (shared playbook palette). */
    accent?: PlaybookAccentToken;
    /** ISO-8601 timestamp the milestone was created. */
    createdAt: string;
    /** ISO-8601 timestamp the milestone was marked met, if it has been. */
    metAt?: string;
}

export const isTreasuryMilestoneStatus = (value: unknown): value is TreasuryMilestoneStatus =>
    typeof value === 'string' && (TREASURY_MILESTONE_STATUSES as readonly string[]).includes(value);

export const isGovernanceTreasuryMilestonePayload = (
    value: unknown,
): value is GovernanceTreasuryMilestonePayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.milestoneId !== 'string' || p.milestoneId.length === 0) return false;
    if (typeof p.title !== 'string') return false;
    if (typeof p.asset !== 'string' || p.asset.length === 0) return false;
    if (typeof p.target !== 'number' || !Number.isFinite(p.target) || p.target <= 0) return false;
    if (!isTreasuryMilestoneStatus(p.status)) return false;
    if (p.accent !== undefined && typeof p.accent !== 'string') return false;
    if (typeof p.createdAt !== 'string') return false;
    if (p.metAt !== undefined && typeof p.metAt !== 'string') return false;
    return true;
};

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
