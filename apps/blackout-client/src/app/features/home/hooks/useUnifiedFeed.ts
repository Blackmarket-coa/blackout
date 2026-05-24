import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { joinedRoomsAtom } from '../../../state/rooms';
import { runtimeFeatureFlags } from '../../../core/features/featureFlags';
import { listStreams } from '../../streams/streamsClient';
import { fetchCoalitionFeed } from '../../coalition/coalitionClient';
import { fetchColiseumTopics } from '../../coliseum/coliseumClient';
import {
    mapCoalition,
    mapColiseum,
    mapDens,
    mapStatuses,
    mapStreams,
    mergeAndRank,
    partitionFollowing,
    selectLiveRail,
    type CoalitionFeedCardItem,
    type ColiseumFeedCardItem,
    type StreamFeedItem,
    type UnifiedFeedItem,
    type UnifiedFeedSource,
} from '../unifiedFeedModel';
import type { RoomLike } from '../feedModel';
import { useStatusUpdates } from './useStatusUpdates';

const REMOTE_FETCH_LIMIT = 30;

export interface UnifiedFeedResult {
    following: UnifiedFeedItem[];
    discover: UnifiedFeedItem[];
    liveRail: StreamFeedItem[];
    loading: boolean;
    errorsBySource: Partial<Record<UnifiedFeedSource, string>>;
}

interface RemoteState {
    streams: StreamFeedItem[];
    coalition: CoalitionFeedCardItem[];
    coliseum: ColiseumFeedCardItem[];
    loading: boolean;
    errorsBySource: Partial<Record<UnifiedFeedSource, string>>;
}

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Request failed';

/**
 * Collects the set of canopy ids the viewer "follows": every joined space
 * (a joined canopy is itself a follow) plus the parent canopy of every
 * joined den. Derived purely from `joinedRoomsAtom` so it stays reactive to
 * Matrix sync and needs no extra atom in tests.
 */
const collectJoinedCanopyIds = (rooms: readonly RoomLike[]): Set<string> => {
    const ids = new Set<string>();
    for (const room of rooms) {
        if (room.getType?.() === 'm.space') ids.add(room.roomId);
        const parent = room.getCanonicalParent?.();
        if (parent) ids.add(parent);
    }
    return ids;
};

export function useUnifiedFeed(): UnifiedFeedResult {
    const rooms = useAtomValue(joinedRoomsAtom) as unknown as Room[];
    const flags = runtimeFeatureFlags;
    // Stream cards/rail link into the `/live/:streamId` viewer, which is owned
    // by `streamsViewer`. Gate the source on it so we never emit dead links
    // when the viewer route isn't mounted.
    const streamsEnabled = flags.streamsViewer;

    const statusEntries = useStatusUpdates(flags.profile);

    const [remote, setRemote] = useState<RemoteState>({
        streams: [],
        coalition: [],
        coliseum: [],
        loading: true,
        errorsBySource: {},
    });

    useEffect(() => {
        let cancelled = false;
        setRemote((prev) => ({ ...prev, loading: true }));
        void (async () => {
            const now = Date.now();
            const [streamsResult, coalitionResult, coliseumResult] = await Promise.allSettled([
                streamsEnabled ? listStreams({ limit: REMOTE_FETCH_LIMIT }) : Promise.resolve(null),
                flags.coalition
                    ? fetchCoalitionFeed({}, { limit: REMOTE_FETCH_LIMIT })
                    : Promise.resolve(null),
                flags.coliseum
                    ? fetchColiseumTopics({}, { limit: REMOTE_FETCH_LIMIT })
                    : Promise.resolve(null),
            ]);
            if (cancelled) return;

            const errorsBySource: Partial<Record<UnifiedFeedSource, string>> = {};
            const streams =
                streamsResult.status === 'fulfilled' && streamsResult.value
                    ? mapStreams(streamsResult.value.items, now)
                    : [];
            if (streamsResult.status === 'rejected')
                errorsBySource.stream = errorMessage(streamsResult.reason);
            const coalition =
                coalitionResult.status === 'fulfilled' && coalitionResult.value
                    ? mapCoalition(coalitionResult.value.items, now)
                    : [];
            if (coalitionResult.status === 'rejected')
                errorsBySource.coalition = errorMessage(coalitionResult.reason);
            const coliseum =
                coliseumResult.status === 'fulfilled' && coliseumResult.value
                    ? mapColiseum(coliseumResult.value.topics, now)
                    : [];
            if (coliseumResult.status === 'rejected')
                errorsBySource.coliseum = errorMessage(coliseumResult.reason);

            setRemote({ streams, coalition, coliseum, loading: false, errorsBySource });
        })();
        return () => {
            cancelled = true;
        };
    }, [streamsEnabled, flags.coalition, flags.coliseum]);

    return useMemo(() => {
        const now = Date.now();
        const denItems = mapDens(rooms as unknown as RoomLike[], now);
        const statusItems = mapStatuses(statusEntries, now);
        const joinedCanopyIds = collectJoinedCanopyIds(rooms as unknown as RoomLike[]);

        const combined: UnifiedFeedItem[] = [
            ...denItems,
            ...statusItems,
            ...remote.streams,
            ...remote.coalition,
            ...remote.coliseum,
        ];

        const discover = mergeAndRank(combined);
        const following = mergeAndRank(partitionFollowing(combined, joinedCanopyIds));
        const liveRail = selectLiveRail(discover);

        return {
            following,
            discover,
            liveRail,
            loading: remote.loading,
            errorsBySource: remote.errorsBySource,
        };
    }, [rooms, statusEntries, remote]);
}
