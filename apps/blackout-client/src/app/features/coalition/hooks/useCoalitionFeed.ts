import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CoalitionFeedItem, CoalitionRankingModel } from '@blackout/core';
import {
    fetchCoalitionEvents,
    fetchCoalitionFeed,
    fetchCoalitionTasks,
    fetchKits,
    fetchMutualAid,
    fetchMyRingInvites,
    fetchRings,
    fetchSellerLocations,
    fetchSpatialFeed,
    type CoalitionFeedResponse,
    type CoalitionScopeQuery,
    type EventsResponse,
    type MutualAidResponse,
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

function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): FetchStateWithRefetch<T> {
    const [state, setState] = useState<FetchState<T>>({
        data: null,
        loading: true,
        error: null,
    });
    const [tick, setTick] = useState(0);
    const requestId = useRef(0);

    useEffect(() => {
        const id = ++requestId.current;
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
    }, [...deps, tick]);

    const refetch = useCallback(() => setTick((value) => value + 1), []);

    return { ...state, refetch };
}

export type { CoalitionScopeQuery } from '../coalitionClient';

export function useCoalitionFeed(
    scope: CoalitionScopeQuery,
    options: { kind?: CoalitionFeedItem['kind']; model?: CoalitionRankingModel; limit?: number } = {},
) {
    return useAsync<CoalitionFeedResponse>(
        () => fetchCoalitionFeed(scope, options),
        [scope.canopyId, scope.denId, options.kind, options.model, options.limit],
    );
}

export function useSpatialFeed(scope: CoalitionScopeQuery, layers?: string[]) {
    const layersKey = useMemo(() => (layers && layers.length > 0 ? layers.join(',') : ''), [layers]);
    return useAsync<SpatialFeedResponse>(
        () => fetchSpatialFeed(scope, layers),
        [scope.canopyId, layersKey],
    );
}

const nearbyKey = (nearby?: NearbyQuery): string =>
    nearby ? `${nearby.lat},${nearby.lng},${nearby.radiusKm}` : '';

export function useMutualAid(scope: CoalitionScopeQuery, nearby?: NearbyQuery) {
    return useAsync<MutualAidResponse>(
        () => fetchMutualAid(scope, nearby),
        [scope.denId, nearbyKey(nearby)],
    );
}

export function useSellerLocations(nearby?: NearbyQuery) {
    return useAsync<SellerLocationsResponse>(
        () => fetchSellerLocations(nearby),
        [nearbyKey(nearby)],
    );
}

export function useCoalitionTasks(scope: CoalitionScopeQuery) {
    return useAsync<TasksResponse>(() => fetchCoalitionTasks(scope), [scope.denId]);
}

export function useCoalitionEvents(scope: CoalitionScopeQuery) {
    return useAsync<EventsResponse>(() => fetchCoalitionEvents(scope), [scope.canopyId, scope.denId]);
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
