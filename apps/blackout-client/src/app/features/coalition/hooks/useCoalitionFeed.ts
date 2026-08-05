import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CoalitionFeedItem, CoalitionRankingModel } from '@blackout/core';
import {
    fetchCoalitionEvents,
    fetchCoalitionFeed,
    fetchCoalitionNeeds,
    fetchCoalitionProject,
    fetchCoalitionProjects,
    fetchCoalitionResources,
    fetchCoalitionTasks,
    fetchFeedComments,
    fetchFeedLikes,
    fetchKits,
    fetchMutualAid,
    fetchCoalitionNotifications,
    fetchMyRingInvites,
    fetchProjectSupporters,
    fetchRings,
    markCoalitionNotificationRead,
    fetchSellerLocations,
    fetchSpatialFeed,
    postFeedComment,
    setFeedLike,
    supportCoalitionProject,
    type CoalitionFeedResponse,
    type ProjectView,
    type SupportProjectInput,
    type FeedCommentsResponse,
    type FeedLikeState,
    type CoalitionScopeQuery,
    type EventsResponse,
    type MutualAidResponse,
    type NeedsResponse,
    type ProjectsResponse,
    type ResourcesResponse,
    type NearbyQuery,
    type RingView,
    type SellerLocationsResponse,
    type SpatialFeedResponse,
    type TasksResponse,
} from '../coalitionClient';

interface FetchState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

interface FetchStateWithRefetch<T> extends FetchState<T> {
    refetch: () => void;
}

/**
 * Fetch on mount and whenever `deps` change.
 *
 * `enabled` makes a toggle a real toggle. The map's legend switches layers on
 * and off, but every source except the spatial feed used to load regardless —
 * so hiding a layer only stopped it being *drawn*, after paying for it. A
 * disabled hook issues no request, and drops whatever it was holding so a
 * re-enabled layer cannot flash the previous canopy's data before its own
 * arrives.
 */
function useAsync<T>(
    loader: () => Promise<T>,
    deps: unknown[],
    enabled = true
): FetchStateWithRefetch<T> {
    const [state, setState] = useState<FetchState<T>>({
        data: null,
        // A disabled hook is not pending; reporting `loading` would leave every
        // hidden layer's spinner up forever.
        loading: enabled,
        error: null,
    });
    const [tick, setTick] = useState(0);
    const requestId = useRef(0);

    useEffect(() => {
        // Bump the id either way, so a response already in flight when the
        // layer is switched off is discarded rather than landing later.
        const id = ++requestId.current;
        if (!enabled) {
            setState({ data: null, loading: false, error: null });
            return;
        }
        setState((prev: FetchState<T>) => ({ ...prev, loading: true, error: null }));
        loader()
            .then((data) => {
                if (id !== requestId.current) return;
                setState({ data, loading: false, error: null });
            })
            .catch((error: unknown) => {
                if (id !== requestId.current) return;
                const message = error instanceof Error ? error.message : 'Request failed';
                setState({ data: null, loading: false, error: message });
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick, enabled]);

    const refetch = useCallback(() => setTick((value) => value + 1), []);

    return { ...state, refetch };
}

export type { CoalitionScopeQuery } from '../coalitionClient';

export function useCoalitionFeed(
    scope: CoalitionScopeQuery,
    options: {
        kind?: CoalitionFeedItem['kind'];
        model?: CoalitionRankingModel;
        limit?: number;
        /** Skip the request entirely — e.g. the map's Stories layer is hidden. */
        enabled?: boolean;
    } = {}
) {
    return useAsync<CoalitionFeedResponse>(
        () => fetchCoalitionFeed(scope, options),
        [scope.canopyId, scope.denId, options.kind, options.model, options.limit],
        options.enabled ?? true
    );
}

export function useSpatialFeed(scope: CoalitionScopeQuery, layers?: string[]) {
    const layersKey = useMemo(
        () => (layers && layers.length > 0 ? layers.join(',') : ''),
        [layers]
    );
    // An empty layer list means "every layer hidden", not "no filter" — the
    // endpoint treats an absent filter as all-layers, so asking for nothing
    // would return everything.
    const enabled = Boolean(layers && layers.length > 0);
    return useAsync<SpatialFeedResponse>(
        () => fetchSpatialFeed(scope, layers),
        [scope.canopyId, layersKey],
        enabled
    );
}

const nearbyKey = (nearby?: NearbyQuery): string =>
    nearby ? `${nearby.lat},${nearby.lng},${nearby.radiusKm}` : '';

export function useMutualAid(scope: CoalitionScopeQuery, nearby?: NearbyQuery, enabled = true) {
    return useAsync<MutualAidResponse>(
        () => fetchMutualAid(scope, nearby),
        [scope.denId, nearbyKey(nearby)],
        enabled
    );
}

export function useSellerLocations(nearby?: NearbyQuery, enabled = true) {
    return useAsync<SellerLocationsResponse>(
        () => fetchSellerLocations(nearby),
        [nearbyKey(nearby)],
        enabled
    );
}

export function useCoalitionTasks(scope: CoalitionScopeQuery) {
    return useAsync<TasksResponse>(() => fetchCoalitionTasks(scope), [scope.denId]);
}

export function useCoalitionNeeds(scope: CoalitionScopeQuery, enabled = true) {
    return useAsync<NeedsResponse>(() => fetchCoalitionNeeds(scope), [scope.canopyId], enabled);
}

export function useCoalitionProjects(scope: CoalitionScopeQuery, enabled = true) {
    return useAsync<ProjectsResponse>(
        () => fetchCoalitionProjects(scope),
        [scope.canopyId],
        enabled
    );
}

/**
 * A single project's funding view (progress, Momentum, endowed framing, supporter
 * wall) plus an imperative `support` mutator that refetches so the progress bar
 * and supporter list stay live after a contribution.
 */
export function useCoalitionProject(projectId: string | null) {
    const view = useAsync<ProjectView | null>(
        () => (projectId ? fetchCoalitionProject(projectId) : Promise.resolve(null)),
        [projectId]
    );
    const { refetch } = view;

    const support = useCallback(
        async (input: SupportProjectInput) => {
            if (!projectId) return;
            await supportCoalitionProject(projectId, input);
            refetch();
        },
        [projectId, refetch]
    );

    return { ...view, support };
}

/**
 * The signed-in user's Coalition notification inbox (surge + milestone events),
 * with an imperative `markRead` that refetches so unread counts stay live.
 */
export function useCoalitionNotifications(options: { unreadOnly?: boolean; limit?: number } = {}) {
    const state = useAsync(
        () => fetchCoalitionNotifications(options),
        [options.unreadOnly, options.limit]
    );
    const { refetch } = state;
    const markRead = useCallback(
        async (id: string) => {
            await markCoalitionNotificationRead(id);
            refetch();
        },
        [refetch]
    );
    return { ...state, markRead };
}

export function useProjectSupporters(projectId: string | null) {
    return useAsync(
        () => (projectId ? fetchProjectSupporters(projectId) : Promise.resolve({ supporters: [] })),
        [projectId]
    );
}

export function useCoalitionResources(scope: CoalitionScopeQuery, enabled = true) {
    return useAsync<ResourcesResponse>(
        () => fetchCoalitionResources(scope),
        [scope.canopyId],
        enabled
    );
}

export function useCoalitionEvents(scope: CoalitionScopeQuery) {
    return useAsync<EventsResponse>(
        () => fetchCoalitionEvents(scope),
        [scope.canopyId, scope.denId]
    );
}

export function useCoalitionRings(memberId?: string) {
    return useAsync<{ rings: RingView[] }>(() => fetchRings(memberId), [memberId]);
}

export function useCoalitionKits() {
    return useAsync(() => fetchKits(), []);
}

export function useMyRingInvites() {
    return useAsync(() => fetchMyRingInvites(), []);
}

/**
 * Likes + comments for a single feed item, plus imperative mutators that
 * refetch after a successful write so counts/lists stay live.
 */
export function useCoalitionVideoEngagement(feedItemId: string) {
    const likes = useAsync<FeedLikeState>(() => fetchFeedLikes(feedItemId), [feedItemId]);
    const comments = useAsync<FeedCommentsResponse>(
        () => fetchFeedComments(feedItemId),
        [feedItemId]
    );
    const { refetch: refetchLikes } = likes;
    const { refetch: refetchComments } = comments;

    const toggleLike = useCallback(
        async (active: boolean) => {
            await setFeedLike(feedItemId, active);
            refetchLikes();
        },
        [feedItemId, refetchLikes]
    );

    const addComment = useCallback(
        async (body: string) => {
            await postFeedComment(feedItemId, body);
            refetchComments();
        },
        [feedItemId, refetchComments]
    );

    return { likes, comments, toggleLike, addComment };
}
