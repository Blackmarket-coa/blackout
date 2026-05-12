/**
 * Pure helpers for the "awaits me" derivation. Takes the per-source data
 * (consent proposals + their reactions, open rounds + their contributions,
 * governance roles) and returns the list of items that need *my* response.
 *
 * Lives outside any React component so it can be unit-tested without
 * jsdom and reused by both the per-room and across-rooms hooks.
 */

import type {
    GovernanceProposalStatus,
    GovernanceProposalType,
    RolePayload,
    RoundOpenedPayload,
} from '@blackout/protocol';
import type { ConsentReaction } from './consent';

const DAY_MS = 86_400_000;

/**
 * Minimal shape `deriveAwaitsMe` needs to know about a proposal. Keeps the
 * core layer free of the feature-layer's `ProposalModel`, which carries
 * client-side bookkeeping (`migrated`, `schemaVersion`, etc.) we don't need.
 */
export interface AwaitsMeProposal {
    proposalEventId: string;
    title: string;
    status: GovernanceProposalStatus;
    type: GovernanceProposalType;
    timestamp: number;
}

export interface AwaitsMeItemConsent {
    kind: 'consent';
    roomId: string;
    proposalEventId: string;
    title: string;
    /** ms timestamp of the proposal opening, for ordering. */
    sortTimestamp: number;
}

export interface AwaitsMeItemRound {
    kind: 'round';
    roomId: string;
    roundEventId: string;
    prompt: string;
    sortTimestamp: number;
}

export interface AwaitsMeItemRole {
    kind: 'role';
    roomId: string;
    roleId: string;
    roleName: string;
    /** Reason flag — currently always 'term-ending' but kept for future. */
    reason: 'term-ending' | 'vacant';
    /** ISO end-of-term for ordering / "X days left" display. */
    termEnd: string;
    sortTimestamp: number;
}

export type AwaitsMeItem = AwaitsMeItemConsent | AwaitsMeItemRound | AwaitsMeItemRole;

export interface AwaitsMeInputs {
    /** The current user id; if null the helper returns nothing. */
    userId: string | null;
    /** Active consent proposals in the room. */
    consentProposals: ReadonlyArray<{
        proposal: AwaitsMeProposal;
        reactions: ReadonlyArray<ConsentReaction>;
    }>;
    /** Open rounds the user might owe a contribution to. */
    openRounds: ReadonlyArray<{
        eventId: string;
        payload: RoundOpenedPayload;
        senderId: string;
        timestamp: number;
        /** User ids that have already contributed to this round. */
        contributors: ReadonlyArray<string>;
    }>;
    /** Governance roles attached to the room. */
    roles: ReadonlyArray<RolePayload>;
    /** Wall-clock ms — injected for deterministic tests; defaults to Date.now. */
    nowMs?: number;
    /** Override the "term ending soon" window. Defaults to 7 days. */
    termSoonWindowMs?: number;
}

/**
 * Pure derivation. Filters each source down to the items that owe a response
 * from the supplied user, then merges into a single newest-first list.
 *
 *   • consent — open proposal where my reactor id is missing
 *   • round   — open round (not facilitated by me) where I haven't replied
 *   • role    — role I hold whose term ends within `termSoonWindowMs`
 *
 * Facilitators are intentionally excluded from their own rounds — they
 * opened the prompt, they don't owe a turn.
 */
export function deriveAwaitsMe(input: AwaitsMeInputs, roomId: string): AwaitsMeItem[] {
    if (!input.userId) return [];
    const now = input.nowMs ?? Date.now();
    const termSoon = input.termSoonWindowMs ?? 7 * DAY_MS;
    const items: AwaitsMeItem[] = [];

    const userId = input.userId;
    for (const { proposal, reactions } of input.consentProposals) {
        if (proposal.status !== 'active') continue;
        if (proposal.type !== 'consent') continue;
        const mine = reactions.find((r) => r.reactorId === userId);
        if (mine) continue;
        items.push({
            kind: 'consent',
            roomId,
            proposalEventId: proposal.proposalEventId,
            title: proposal.title,
            sortTimestamp: proposal.timestamp,
        });
    }

    for (const round of input.openRounds) {
        if (round.payload.status !== 'open') continue;
        if (round.payload.facilitator === userId) continue;
        if (round.contributors.includes(userId)) continue;
        // Honor explicit invitees: if a non-empty list is given, only those
        // members owe a turn.
        if (
            round.payload.invitees &&
            round.payload.invitees.length > 0 &&
            !round.payload.invitees.includes(userId)
        ) {
            continue;
        }
        items.push({
            kind: 'round',
            roomId,
            roundEventId: round.eventId,
            prompt: round.payload.prompt,
            sortTimestamp: round.timestamp,
        });
    }

    for (const role of input.roles) {
        if (role.holderId !== userId) continue;
        const endMs = Date.parse(role.termEnd);
        if (!Number.isFinite(endMs)) continue;
        const delta = endMs - now;
        if (delta > termSoon) continue;
        items.push({
            kind: 'role',
            roomId,
            roleId: role.roleId,
            roleName: role.name,
            reason: 'term-ending',
            termEnd: role.termEnd,
            sortTimestamp: endMs,
        });
    }

    items.sort((a, b) => b.sortTimestamp - a.sortTimestamp);
    return items;
}
