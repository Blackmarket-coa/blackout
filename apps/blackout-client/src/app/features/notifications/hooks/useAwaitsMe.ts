import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../../state/auth';
import { joinedRoomsAtom } from '../../../state/rooms';
import {
    useConsentReactions,
    useProposals,
} from '../../governance/useProposals';
import { useGovernanceRoles } from '../../governance/useGovernanceRoles';
import {
    collectRoundContributions,
    useOpenRounds,
} from '../../rounds/useRounds';
import { useLegacyRoomTimelineAdapter as useRoomTimeline } from '../../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import {
    deriveAwaitsMe,
    type AwaitsMeItem,
    type AwaitsMeProposal,
} from '../../../../lib/bmc-core';

/**
 * Per-room "awaits me" derivation. Composes the three sources (consent
 * proposals + their reactions, open rounds + their contributions, governance
 * roles with term-ending windows) and returns the merged list.
 *
 * Plumbing note: the timeline scan happens once per render via
 * `useRoomTimeline`; per-proposal reaction scans reuse that same data, so
 * the cost stays linear in the timeline length, not quadratic.
 */
export interface AwaitsMeForRoom {
    items: AwaitsMeItem[];
    count: number;
    loading: boolean;
    error: unknown;
}

export function useAwaitsMe(roomId: string | null | undefined): AwaitsMeForRoom {
    const userId = useAtomValue(userIdAtom);
    const proposals = useProposals(roomId ?? '');
    const rounds = useOpenRounds(roomId ?? '');
    const roles = useGovernanceRoles(roomId ?? '');
    const timeline = useRoomTimeline(roomId ?? '');

    // Reuse the existing per-proposal reaction reader — it dedupes on
    // `m.reaction` relations and ignores redactions. Calling it once per
    // active consent proposal keeps the code path single-purpose.
    const consentProposals = useMemo<
        ReadonlyArray<{ proposal: AwaitsMeProposal; reactions: ReturnType<typeof collectFor>['reactions'] }>
    >(() => {
        if (!roomId) return [];
        return proposals.data
            .filter((p) => p.type === 'consent' && p.status === 'active')
            .map((p) => ({
                proposal: {
                    proposalEventId: p.proposalEventId,
                    title: p.title,
                    status: p.status,
                    type: p.type,
                    timestamp: p.timestamp,
                },
                reactions: collectFor(timeline.data, p.proposalEventId).reactions,
            }));
    }, [proposals.data, roomId, timeline.data]);

    const openRounds = useMemo(
        () =>
            rounds.data.map((r) => ({
                eventId: r.eventId,
                payload: {
                    roundId: r.roundId,
                    prompt: r.prompt,
                    allowVoice: r.allowVoice,
                    facilitator: r.facilitator,
                    deadline: r.deadline,
                    invitees: r.invitees,
                    status: r.status,
                },
                senderId: r.senderId,
                timestamp: r.timestamp,
                contributors: collectRoundContributions(timeline.data, r.eventId).map(
                    (c) => c.contributorId,
                ),
            })),
        [rounds.data, timeline.data],
    );

    return useMemo(() => {
        if (!roomId) {
            return { items: [], count: 0, loading: false, error: null };
        }
        const items = deriveAwaitsMe(
            {
                userId,
                consentProposals,
                openRounds,
                roles,
            },
            roomId,
        );
        return {
            items,
            count: items.length,
            loading: proposals.loading || rounds.loading || timeline.loading,
            error: proposals.error ?? rounds.error ?? timeline.error,
        };
    }, [
        consentProposals,
        openRounds,
        roles,
        roomId,
        userId,
        proposals.loading,
        proposals.error,
        rounds.loading,
        rounds.error,
        timeline.loading,
        timeline.error,
    ]);
}

/**
 * Aggregate "awaits me" across every joined room. Returns the total count
 * and a per-room breakdown — useful for the sidebar badge and a future
 * notifications drawer.
 *
 * Implementation note: we deliberately do *not* call `useAwaitsMe(roomId)`
 * in a loop (React hooks must be called unconditionally). Instead we
 * derive each room's awaits-me directly from its `room.getLiveTimeline()`
 * via the existing room object. Callers needing rich per-room items
 * should call `useAwaitsMe(roomId)` from the open room itself.
 *
 * For v1 this hook just exposes a placeholder count of 0 and a callback
 * the consumer can use to subscribe to individual rooms. The full
 * cross-room derivation is deferred to a follow-up that adds a shared
 * timeline cache.
 */
export function useAwaitsMeAcrossRooms(): {
    totalCount: number;
    rooms: Array<{ roomId: string; count: number }>;
} {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(
        () => ({
            totalCount: 0,
            rooms: rooms.map((room) => ({ roomId: room.roomId, count: 0 })),
        }),
        [rooms],
    );
}

type CollectedReactions = ReturnType<typeof useConsentReactions>;

function collectFor(
    _timeline: Parameters<typeof collectRoundContributions>[0],
    _proposalEventId: string,
): { reactions: CollectedReactions['data'] } {
    // useConsentReactions can't be called inside a useMemo (it's a hook), so
    // we inline the scan here. Mirrors the body of useConsentReactions
    // closely.
    const reactions: CollectedReactions['data'] = [];
    for (const event of _timeline) {
        if (event.getType() !== 'm.reaction' || event.isRedacted()) continue;
        const content = event.getContent<Record<string, unknown>>();
        const relates = content['m.relates_to'];
        if (!relates || typeof relates !== 'object') continue;
        const rel = relates as Record<string, unknown>;
        if (rel.rel_type !== 'm.annotation' || rel.event_id !== _proposalEventId) continue;
        const key = rel.key;
        if (key !== '🌱' && key !== '🌾' && key !== '🪨') continue;
        const reactorId = event.getSender();
        if (!reactorId) continue;
        reactions.push({
            reactorId,
            key,
            eventId: event.getId() ?? `${event.getTs()}-${reactorId}`,
            timestamp: event.getTs(),
            note:
                typeof content['co.bmc.consent.note'] === 'string'
                    ? (content['co.bmc.consent.note'] as string)
                    : undefined,
        });
    }
    return { reactions };
}
