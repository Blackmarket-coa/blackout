import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { joinedRoomsAtom } from '../../../state/rooms';
import { mDirectAtom } from '../../../state/mDirectList';
import { runtimeFeatureFlags } from '../../../core/features/featureFlags';
import { listStreams } from '../../streams/streamsClient';
import { fetchCoalitionFeed } from '../../coalition/coalitionClient';
import { fetchColiseumTopics } from '../../coliseum/coliseumClient';
import { fetchListings } from '../../monetization/marketplace/marketplaceClient';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';
import { GOVERNANCE_PROPOSAL_EVENT_TYPE } from '@blackout/protocol';
import { normalizeProposalEventContent } from '../../governance/eventSchemas';
import {
    mapCoalition,
    mapColiseum,
    mapDens,
    mapGovernance,
    mapMarketplace,
    mapStatuses,
    mapStreams,
    mapWallPosts,
    mergeAndRank,
    partitionFollowing,
    selectLiveRail,
    UNIFIED_FEED_DEFAULT_MAX_PER_SOURCE,
    withSeriesBadges,
    type CoalitionFeedCardItem,
    type ColiseumFeedCardItem,
    type FeedSort,
    type GovernanceProposalEntry,
    type MarketplaceFeedItem,
    type StreamFeedItem,
    type UnifiedFeedItem,
    type UnifiedFeedSource,
} from '../unifiedFeedModel';
import type { RoomLike } from '../feedModel';
import { useFollowedActivity } from './useFollowedActivity';
import { useDiscoveryInterestTags } from '../discoveryInterests';

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
    marketplace: MarketplaceFeedItem[];
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

/**
 * Extract governance proposals from joined-room state. Proposals are
 * `GOVERNANCE_PROPOSAL_EVENT_TYPE` state events (canopy spaces and dens);
 * normalized here and handed to the pure `mapGovernance` so the feed model
 * stays matrix-free. The proposal's canopy is the space itself, or the den's
 * canonical parent, so it lands in the Following partition correctly.
 */
const collectGovernanceProposals = (rooms: readonly Room[]): GovernanceProposalEntry[] => {
    const entries: GovernanceProposalEntry[] = [];
    for (const room of rooms) {
        const raw = room.currentState?.getStateEvents(GOVERNANCE_PROPOSAL_EVENT_TYPE);
        const events = Array.isArray(raw) ? raw : raw ? [raw] : [];
        if (events.length === 0) continue;
        const roomLike = room as unknown as RoomLike;
        const canopyId =
            roomLike.getType?.() === 'm.space'
                ? room.roomId
                : roomLike.getCanonicalParent?.() ?? null;
        for (const event of events) {
            const normalized = normalizeProposalEventContent(
                event.getContent<Record<string, unknown>>()
            );
            if (!normalized.data) continue;
            entries.push({
                proposalEventId: event.getId() ?? `${room.roomId}-${event.getStateKey() ?? ''}`,
                canopyId,
                title: normalized.data.title,
                status: normalized.data.status,
                proposalType: normalized.data.type,
                createdAt: event.getTs(),
            });
        }
    }
    return entries;
};

export function useUnifiedFeed(sort?: FeedSort): UnifiedFeedResult {
    const rooms = useAtomValue(joinedRoomsAtom) as unknown as Room[];
    const mDirects = useAtomValue(mDirectAtom);
    const flags = runtimeFeatureFlags;
    // Stream cards/rail link into the `/live/:streamId` viewer, which is owned
    // by `streamsViewer`. Gate the source on it so we never emit dead links
    // when the viewer route isn't mounted.
    const streamsEnabled = flags.streamsViewer;
    const marketplaceEnabled = flags.marketTab;

    const activity = useFollowedActivity(flags.profile);
    const boostTags = useDiscoveryInterestTags();

    const [remote, setRemote] = useState<RemoteState>({
        streams: [],
        coalition: [],
        coliseum: [],
        marketplace: [],
        loading: true,
        errorsBySource: {},
    });

    useEffect(() => {
        let cancelled = false;
        setRemote((prev) => ({ ...prev, loading: true }));
        void (async () => {
            const now = Date.now();
            const [streamsResult, coalitionResult, coliseumResult, marketplaceResult] =
                await Promise.allSettled([
                    streamsEnabled
                        ? listStreams({ limit: REMOTE_FETCH_LIMIT })
                        : Promise.resolve(null),
                    flags.coalition
                        ? fetchCoalitionFeed({}, { limit: REMOTE_FETCH_LIMIT })
                        : Promise.resolve(null),
                    flags.coliseum
                        ? fetchColiseumTopics({}, { limit: REMOTE_FETCH_LIMIT })
                        : Promise.resolve(null),
                    marketplaceEnabled
                        ? fetchListings({}, readBlackoutApiToken())
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
            const marketplace =
                marketplaceResult.status === 'fulfilled' && marketplaceResult.value
                    ? mapMarketplace(marketplaceResult.value, now)
                    : [];
            if (marketplaceResult.status === 'rejected')
                errorsBySource.marketplace = errorMessage(marketplaceResult.reason);

            setRemote({
                streams,
                coalition,
                coliseum,
                marketplace,
                loading: false,
                errorsBySource,
            });
        })();
        return () => {
            cancelled = true;
        };
    }, [streamsEnabled, marketplaceEnabled, flags.coalition, flags.coliseum]);

    return useMemo(() => {
        const now = Date.now();
        const denItems = mapDens(rooms as unknown as RoomLike[], now, mDirects);
        const statusItems = mapStatuses(activity.statuses, now);
        const wallItems = mapWallPosts(activity.walls, now);
        const governanceItems = flags.governance
            ? mapGovernance(collectGovernanceProposals(rooms), now)
            : [];
        const joinedCanopyIds = collectJoinedCanopyIds(rooms as unknown as RoomLike[]);

        const merged: UnifiedFeedItem[] = [
            ...denItems,
            ...statusItems,
            ...wallItems,
            ...governanceItems,
            ...remote.streams,
            ...remote.coalition,
            ...remote.coliseum,
            ...remote.marketplace,
        ];
        const combined = flags.seriesTag ? withSeriesBadges(merged) : merged;

        const maxPerSource = UNIFIED_FEED_DEFAULT_MAX_PER_SOURCE;
        const discover = mergeAndRank(combined, { boostTags, sort, now, maxPerSource });
        const following = mergeAndRank(partitionFollowing(combined, joinedCanopyIds), {
            boostTags,
            sort,
            now,
            maxPerSource,
        });
        const liveRail = selectLiveRail(discover);

        return {
            following,
            discover,
            liveRail,
            loading: remote.loading,
            errorsBySource: remote.errorsBySource,
        };
    }, [rooms, mDirects, activity, remote, boostTags, sort]);
}
