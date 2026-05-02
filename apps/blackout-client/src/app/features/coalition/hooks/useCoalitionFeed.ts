import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoalitionFeedItem, CoalitionRankingModel } from '@blackout/core';
import {
    fetchCoalitionFeed,
    fetchMutualAid,
    fetchSellerLocations,
    fetchSpatialFeed,
    type CoalitionFeedResponse,
    type CoalitionScopeQuery,
    type MutualAidResponse,
    type SellerLocationsResponse,
    type SpatialFeedResponse,
} from '../coalitionClient';

interface FetchState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): FetchState<T> {
    const [state, setState] = useState<FetchState<T>>({
        data: null,
        loading: true,
        error: null,
    });
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
    }, deps);

    return state;
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

export function useMutualAid(scope: CoalitionScopeQuery) {
    return useAsync<MutualAidResponse>(() => fetchMutualAid(scope), [scope.denId]);
}

export function useSellerLocations() {
    return useAsync<SellerLocationsResponse>(() => fetchSellerLocations(), []);
}
