import type { MatrixEvent, Room } from 'matrix-js-sdk';
import {
    GOVERNANCE_PROPOSAL_EVENT_TYPE,
    ROLE_EVENT_TYPE,
    ROUND_CLOSED_EVENT_TYPE,
    ROUND_OPENED_EVENT_TYPE,
    isRolePayload,
    isRoundOpenedPayload,
    type RolePayload,
    type RoundClosedPayload,
    type RoundOpenedPayload,
} from '@blackout/protocol';
import {
    deriveAwaitsMe,
    isConsentKey,
    type AwaitsMeItem,
    type AwaitsMeProposal,
    type ConsentReaction,
} from '../../../lib/bmc-core';
import { normalizeProposalEventContent } from '../governance/eventSchemas';

/**
 * Pure-ish helper that walks a Matrix Room's state + live timeline once
 * and returns the awaits-me items the user owes a response to. Folds the
 * per-source readers (proposals + consent reactions + open rounds + role
 * terms) into a single function so the across-rooms aggregator can call
 * it for every joined room without scaling the React-hook count with
 * room count.
 *
 * Uses the same `deriveAwaitsMe` helper as the per-room hook, so the two
 * paths agree on the rules (facilitator excluded from own rounds, invitee
 * lists honored, term-ending window default 7d).
 */
export function awaitsMeForMatrixRoom(
    room: Room,
    userId: string | null,
): AwaitsMeItem[] {
    if (!userId) return [];

    const state = room.currentState;
    const timeline = room.getLiveTimeline?.()?.getEvents?.() ?? [];

    // ── Proposals → consent-typed + active ────────────────────────────
    const proposalEventsRaw = state?.getStateEvents(GOVERNANCE_PROPOSAL_EVENT_TYPE);
    const proposalEvents: MatrixEvent[] = Array.isArray(proposalEventsRaw)
        ? proposalEventsRaw
        : proposalEventsRaw
          ? [proposalEventsRaw]
          : [];

    const consentProposals: Array<{
        proposal: AwaitsMeProposal;
        reactions: ReadonlyArray<ConsentReaction>;
    }> = [];

    for (const event of proposalEvents) {
        if (event.isRedacted()) continue;
        const normalized = normalizeProposalEventContent(
            event.getContent<Record<string, unknown>>(),
        );
        if (!normalized.data) continue;
        if (normalized.data.type !== 'consent') continue;
        if (normalized.data.status !== 'active') continue;

        const proposalEventId = event.getId() ?? '';
        if (!proposalEventId) continue;

        const proposal: AwaitsMeProposal = {
            proposalEventId,
            title: normalized.data.title,
            status: normalized.data.status,
            type: normalized.data.type,
            timestamp: event.getTs(),
        };

        const reactions: ConsentReaction[] = [];
        for (const e of timeline) {
            if (e.getType() !== 'm.reaction' || e.isRedacted()) continue;
            const content = e.getContent<Record<string, unknown>>();
            const relates = content['m.relates_to'];
            if (!relates || typeof relates !== 'object') continue;
            const rel = relates as Record<string, unknown>;
            if (rel.rel_type !== 'm.annotation' || rel.event_id !== proposalEventId) continue;
            if (!isConsentKey(rel.key)) continue;
            const reactorId = e.getSender();
            if (!reactorId) continue;
            reactions.push({
                reactorId,
                key: rel.key,
                eventId: e.getId() ?? `${e.getTs()}-${reactorId}`,
                timestamp: e.getTs(),
                note:
                    typeof content['co.bmc.consent.note'] === 'string'
                        ? (content['co.bmc.consent.note'] as string)
                        : undefined,
            });
        }

        consentProposals.push({ proposal, reactions });
    }

    // ── Rounds → currently-open (no matching close event) ─────────────
    const opens = new Map<string, {
        eventId: string;
        payload: RoundOpenedPayload;
        senderId: string;
        timestamp: number;
        contributors: string[];
    }>();
    const closedIds = new Set<string>();

    for (const e of timeline) {
        if (e.isRedacted()) continue;
        const t = e.getType();
        if (t === ROUND_OPENED_EVENT_TYPE) {
            const payload = e.getContent<Record<string, unknown>>();
            if (!isRoundOpenedPayload(payload)) continue;
            opens.set(payload.roundId, {
                eventId: e.getId() ?? '',
                payload,
                senderId: e.getSender() ?? payload.facilitator,
                timestamp: e.getTs(),
                contributors: [],
            });
        } else if (t === ROUND_CLOSED_EVENT_TYPE) {
            const payload = e.getContent<RoundClosedPayload>();
            if (payload && typeof payload.roundId === 'string') {
                closedIds.add(payload.roundId);
            }
        }
    }

    for (const e of timeline) {
        if (e.isRedacted()) continue;
        if (e.getType() !== 'm.room.message') continue;
        const content = e.getContent<Record<string, unknown>>();
        const relates = content['m.relates_to'];
        if (!relates || typeof relates !== 'object') continue;
        const reply = (relates as Record<string, unknown>)['m.in_reply_to'];
        if (!reply || typeof reply !== 'object') continue;
        const target = (reply as Record<string, unknown>).event_id;
        if (typeof target !== 'string') continue;
        const sender = e.getSender();
        if (!sender) continue;
        // Find the matching open round and record the contributor (if any).
        for (const round of opens.values()) {
            if (round.eventId === target && !round.contributors.includes(sender)) {
                round.contributors.push(sender);
            }
        }
    }

    const openRounds = [...opens.values()].filter(
        (round) => !closedIds.has(round.payload.roundId) && round.payload.status === 'open',
    );

    // ── Roles → state events keyed by roleId ──────────────────────────
    const roleEventsRaw = state?.getStateEvents(ROLE_EVENT_TYPE);
    const roleEvents: MatrixEvent[] = Array.isArray(roleEventsRaw)
        ? roleEventsRaw
        : roleEventsRaw
          ? [roleEventsRaw]
          : [];
    const roles: RolePayload[] = [];
    for (const e of roleEvents) {
        const content = e.getContent<Record<string, unknown>>();
        if (isRolePayload(content)) roles.push(content);
    }

    return deriveAwaitsMe(
        {
            userId,
            consentProposals,
            openRounds,
            roles,
        },
        room.roomId,
    );
}
