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
import {
    awaitsMeAcrossRoomsAtom,
    awaitsMeByRoomAtom,
    type AwaitsMeAcrossRoomsValue,
} from '../../../state/awaitsMe';

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
 * Aggregate "awaits me" across every joined room.
 *
 * Backed by `awaitsMeAcrossRoomsAtom` — a Jotai derived atom that
 * memoizes the computation across all subscribers. Sidebar rows, shell
 * badges, and the standalone drawer share the same walk per dependency
 * change, so adding consumers costs nothing.
 */
export type AwaitsMeAcrossRoomsResult = AwaitsMeAcrossRoomsValue;

export function useAwaitsMeAcrossRooms(): AwaitsMeAcrossRoomsResult {
    return useAtomValue(awaitsMeAcrossRoomsAtom);
}

/**
 * Per-room cheap lookup of the awaits-me count, used by sidebar rows.
 * Subscribes only to the `byRoom` slice so reshuffles of the merged
 * items list don't re-render every row.
 */
export function useAwaitsMeCount(roomId: string | null | undefined): number {
    const byRoom = useAtomValue(awaitsMeByRoomAtom);
    if (!roomId) return 0;
    return byRoom.get(roomId) ?? 0;
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
