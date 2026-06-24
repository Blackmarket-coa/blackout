import { useCallback, useMemo } from 'react';
import {
    DEN_OBJECTIVE_CONTRIBUTION_EVENT_TYPE,
    DEN_OBJECTIVE_EVENT_TYPE,
    isDenObjectiveContributionPayload,
    isDenObjectivePayload,
    type DenObjectiveContributionPayload,
    type DenObjectivePayload,
} from '@blackout/protocol';
import {
    aggregateObjectiveProgress,
    type ObjectiveProgress,
    type ObjectiveProgressContribution,
} from '@blackout/core';
import { createObjectiveMatrixActions } from '@blackout/sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useLegacyRoomAdapter as useRoom } from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
import { useLegacyRoomTimelineAdapter as useRoomTimeline } from '../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';

export interface ObjectiveModel extends DenObjectivePayload {
    /** Matrix room id this objective belongs to. */
    roomId: string;
}

/**
 * Hook: read the shared objectives attached to a den.
 *
 * Objectives are state events keyed by `objectiveId`; a den may run several.
 * Returns them newest-first. Archived objectives are dropped by default so the
 * den surface stays focused on live goals (callers can opt in via `includeArchived`).
 */
export const useDenObjectives = (
    roomId: string,
    options: { includeArchived?: boolean } = {},
) => {
    const roomState = useRoom(roomId);
    const includeArchived = options.includeArchived ?? false;

    return useMemo(() => {
        if (!roomState.data) {
            return {
                data: [] as ObjectiveModel[],
                loading: roomState.loading,
                error: roomState.error,
            };
        }

        const raw = roomState.data.currentState.getStateEvents(DEN_OBJECTIVE_EVENT_TYPE);
        const events = Array.isArray(raw) ? raw : raw ? [raw] : [];

        const objectives = events
            .map((event) => {
                const content = event.getContent<Record<string, unknown>>();
                if (!isDenObjectivePayload(content)) return null;
                return { ...content, roomId } satisfies ObjectiveModel;
            })
            .filter((item): item is ObjectiveModel => item !== null)
            .filter((item) => includeArchived || item.status !== 'archived')
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

        return { data: objectives, loading: roomState.loading, error: roomState.error };
    }, [roomId, includeArchived, roomState.data, roomState.loading, roomState.error]);
};

/**
 * Hook: derive aggregate progress for one objective from its contribution
 * timeline. Aggregate-only by construction — `aggregateObjectiveProgress`
 * returns a total, a clamped percent, and a distinct-contributor *count*,
 * never a per-member breakdown. No contribution awards XP or reputation.
 */
export const useObjectiveProgress = (
    objectiveId: string,
    target: number,
    roomId: string,
): { data: ObjectiveProgress; loading: boolean; error: unknown } => {
    const timeline = useRoomTimeline(roomId);

    return useMemo(() => {
        const seen = new Set<string>();
        const contributions: ObjectiveProgressContribution[] = [];

        for (const event of timeline.data) {
            if (event.getType() !== DEN_OBJECTIVE_CONTRIBUTION_EVENT_TYPE) continue;
            if (event.isRedacted?.()) continue;
            const content = event.getContent<Record<string, unknown>>();
            if (!isDenObjectiveContributionPayload(content)) continue;
            if (content.objectiveId !== objectiveId) continue;

            const eventId = event.getId() ?? `${event.getTs()}-${event.getSender()}`;
            if (seen.has(eventId)) continue;
            seen.add(eventId);

            contributions.push({
                contributorId: event.getSender() ?? 'unknown',
                amount: content.amount,
            });
        }

        return {
            data: aggregateObjectiveProgress(target, contributions),
            loading: timeline.loading,
            error: timeline.error,
        };
    }, [objectiveId, target, timeline.data, timeline.loading, timeline.error]);
};

/**
 * Hook: build client-bound objective writers. Returns a stable actions object
 * whose `setObjective`/`contribute` take the `roomId` — so the same hook serves
 * both an existing den and a freshly-formed party (roomId known only after creation).
 */
export const useObjectiveActions = () => {
    const client = useMatrixClient();
    return useMemo(
        () =>
            createObjectiveMatrixActions({
                sendEvent: (rid, et, content) => client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );
};

/** Hook: set/edit an objective on a known den. */
export const useSetObjective = (roomId: string) => {
    const actions = useObjectiveActions();
    return useCallback(
        (payload: DenObjectivePayload) => actions.setObjective(roomId, payload),
        [actions, roomId],
    );
};

/** Hook: log a contribution toward an objective on a known den. */
export const useContributeToObjective = (roomId: string) => {
    const actions = useObjectiveActions();
    return useCallback(
        (payload: DenObjectiveContributionPayload) => actions.contribute(roomId, payload),
        [actions, roomId],
    );
};
