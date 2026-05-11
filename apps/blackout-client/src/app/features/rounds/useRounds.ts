import { useCallback, useMemo } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import {
    ROUND_CLOSED_EVENT_TYPE,
    ROUND_OPENED_EVENT_TYPE,
    type RoundClosedPayload,
    type RoundOpenedPayload,
} from '@blackout/protocol';
import { createRoundsMatrixActions } from '@blackout/sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useLegacyRoomTimelineAdapter as useRoomTimeline } from '../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import { useCompleteQuest } from '../quests/useQuests';

export interface OpenRoundModel extends RoundOpenedPayload {
    /** Matrix event id of the opening event. Required to anchor replies. */
    eventId: string;
    /** Matrix user id of the sender (the facilitator who opened it). */
    senderId: string;
    /** Wall-clock ms timestamp from the homeserver. */
    timestamp: number;
}

export interface RoundContribution {
    eventId: string;
    contributorId: string;
    timestamp: number;
    /** True when this contribution carries an MSC3245 voice payload. */
    isVoice: boolean;
}

/**
 * Hook: list open rounds in a den (newest first). A round is "open" when no
 * matching `co.bmc.governance.round.closed` event has landed referencing the
 * same `roundId`. The tally is intentionally per-round so a den with several
 * concurrent rounds (e.g. parallel circles in a Workshop) renders cleanly.
 */
export const useOpenRounds = (
    roomId: string,
): { data: OpenRoundModel[]; loading: boolean; error: unknown } => {
    const timeline = useRoomTimeline(roomId);

    return useMemo(() => {
        const opens = new Map<string, OpenRoundModel>();
        const closedIds = new Set<string>();

        for (const event of timeline.data) {
            if (event.isRedacted()) continue;
            const type = event.getType();
            if (type === ROUND_OPENED_EVENT_TYPE) {
                const content = event.getContent<RoundOpenedPayload>();
                if (!content || typeof content.roundId !== 'string') continue;
                opens.set(content.roundId, {
                    ...content,
                    eventId: event.getId() ?? `${event.getTs()}-${content.roundId}`,
                    senderId: event.getSender() ?? content.facilitator,
                    timestamp: event.getTs(),
                });
                continue;
            }
            if (type === ROUND_CLOSED_EVENT_TYPE) {
                const content = event.getContent<RoundClosedPayload>();
                if (content && typeof content.roundId === 'string') {
                    closedIds.add(content.roundId);
                }
            }
        }

        const data = [...opens.values()]
            .filter((round) => !closedIds.has(round.roundId) && round.status === 'open')
            .sort((a, b) => b.timestamp - a.timestamp);

        return { data, loading: timeline.loading, error: timeline.error };
    }, [timeline.data, timeline.loading, timeline.error]);
};

/**
 * Pure: from a timeline + round-opening event id, collect every reply whose
 * `m.in_reply_to.event_id` points at the round. One contribution per
 * contributor (latest wins) so the avatar moves to "spoken" the moment they
 * post anything.
 */
export const collectRoundContributions = (
    timeline: ReadonlyArray<MatrixEvent>,
    roundEventId: string,
): RoundContribution[] => {
    const latestByContributor = new Map<string, RoundContribution>();

    for (const event of timeline) {
        if (event.isRedacted()) continue;
        if (event.getType() !== 'm.room.message') continue;
        const content = event.getContent<Record<string, unknown>>();
        const relates = content['m.relates_to'];
        if (!relates || typeof relates !== 'object') continue;
        const reply = (relates as Record<string, unknown>)['m.in_reply_to'];
        if (!reply || typeof reply !== 'object') continue;
        const target = (reply as Record<string, unknown>).event_id;
        if (target !== roundEventId) continue;

        const contributorId = event.getSender() ?? 'unknown';
        const eventId = event.getId() ?? `${event.getTs()}-${contributorId}`;
        const timestamp = event.getTs();
        const isVoice =
            content['org.matrix.msc3245.voice'] !== undefined ||
            content['org.matrix.msc1767.audio'] !== undefined;

        const existing = latestByContributor.get(contributorId);
        if (!existing || timestamp > existing.timestamp) {
            latestByContributor.set(contributorId, {
                eventId,
                contributorId,
                timestamp,
                isVoice,
            });
        }
    }

    return [...latestByContributor.values()].sort((a, b) => b.timestamp - a.timestamp);
};

export const useRoundContributions = (
    roomId: string,
    roundEventId: string | null,
): { data: RoundContribution[]; loading: boolean; error: unknown } => {
    const timeline = useRoomTimeline(roomId);
    return useMemo(() => {
        if (!roundEventId) return { data: [], loading: timeline.loading, error: timeline.error };
        return {
            data: collectRoundContributions(timeline.data, roundEventId),
            loading: timeline.loading,
            error: timeline.error,
        };
    }, [roundEventId, timeline.data, timeline.loading, timeline.error]);
};

/**
 * Hook: open a new round. Caller supplies the prompt and (optionally)
 * `allowVoice` / `deadline` / `invitees`; we generate the `roundId` and
 * stamp the facilitator from the current user.
 */
export const useOpenRound = (roomId: string, facilitatorId: string | null) => {
    const client = useMatrixClient();
    const completeQuest = useCompleteQuest();
    const actions = useMemo(
        () =>
            createRoundsMatrixActions({
                sendEvent: (rid, et, content) =>
                    client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );

    return useCallback(
        async ({
            prompt,
            allowVoice = true,
            deadline,
            invitees,
        }: {
            prompt: string;
            allowVoice?: boolean;
            deadline?: string;
            invitees?: string[];
        }) => {
            if (!facilitatorId) throw new Error('useOpenRound: facilitator id is required');
            const trimmed = prompt.trim();
            if (!trimmed) throw new Error('useOpenRound: prompt is required');
            await actions.openRound(roomId, {
                roundId: crypto.randomUUID(),
                prompt: trimmed,
                allowVoice,
                facilitator: facilitatorId,
                deadline,
                invitees,
                status: 'open',
            });
            // J3 quest auto-completion: facilitating a round ticks the
            // "first-round" beat. Idempotent — calls after the first are
            // no-ops.
            void completeQuest('first-round', roomId);
        },
        [actions, completeQuest, facilitatorId, roomId],
    );
};

/**
 * Hook: close a round. The closing event references the opening event's
 * `roundId` so clients can pair them.
 */
export const useCloseRound = (roomId: string, closerId: string | null) => {
    const client = useMatrixClient();
    const actions = useMemo(
        () =>
            createRoundsMatrixActions({
                sendEvent: (rid, et, content) =>
                    client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );
    return useCallback(
        async (roundId: string) => {
            if (!closerId) throw new Error('useCloseRound: closer id is required');
            await actions.closeRound(roomId, {
                roundId,
                closedAt: new Date().toISOString(),
                closedBy: closerId,
            });
        },
        [actions, closerId, roomId],
    );
};
