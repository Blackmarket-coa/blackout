import { useEffect, useRef, useState } from 'react';
import type {
    AidPost,
    CoalitionFeedItem,
    CoalitionRankingModel,
    SellerLocation,
    SpatialFeedItem,
} from '@blackout/core';

const API_ROOT = '/v1/coalition';

export interface CoalitionScopeQuery {
    canopyId?: string;
    denId?: string;
}

interface FetchState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

function useApi<T>(path: string, deps: unknown[]): FetchState<T> {
    const [state, setState] = useState<FetchState<T>>({
        data: null,
        loading: true,
        error: null,
    });
    const requestId = useRef(0);

    useEffect(() => {
        const id = ++requestId.current;
        setState((prev) => ({ ...prev, loading: true, error: null }));
        fetch(path, { credentials: 'include' })
            .then(async (res) => {
                if (!res.ok) throw new Error(`Request failed: ${res.status}`);
                return (await res.json()) as T;
            })
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

function buildQuery(params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            search.set(key, String(value));
        }
    }
    const qs = search.toString();
    return qs ? `?${qs}` : '';
}

export interface CoalitionFeedResponse {
    generatedAt: string;
    items: CoalitionFeedItem[];
}

export function useCoalitionFeed(
    scope: CoalitionScopeQuery,
    options: { kind?: CoalitionFeedItem['kind']; model?: CoalitionRankingModel; limit?: number } = {},
) {
    const query = buildQuery({
        canopyId: scope.canopyId,
        denId: scope.denId,
        kind: options.kind,
        model: options.model,
        limit: options.limit,
    });
    return useApi<CoalitionFeedResponse>(`${API_ROOT}/feed${query}`, [
        scope.canopyId,
        scope.denId,
        options.kind,
        options.model,
        options.limit,
    ]);
}

export interface SpatialFeedResponse {
    generatedAt: string;
    layers: string[];
    items: SpatialFeedItem[];
}

export function useSpatialFeed(scope: CoalitionScopeQuery, layers?: string[]) {
    const query = buildQuery({
        canopyId: scope.canopyId,
        layers: layers && layers.length > 0 ? layers.join(',') : undefined,
    });
    return useApi<SpatialFeedResponse>(`${API_ROOT}/spatial-feed${query}`, [
        scope.canopyId,
        layers ? layers.join(',') : '',
    ]);
}

export interface MutualAidResponse {
    posts: AidPost[];
}

export function useMutualAid(scope: CoalitionScopeQuery) {
    const query = buildQuery({ denId: scope.denId });
    return useApi<MutualAidResponse>(`${API_ROOT}/mutual-aid${query}`, [scope.denId]);
}

export interface SellerLocationsResponse {
    locations: SellerLocation[];
}

export function useSellerLocations() {
    return useApi<SellerLocationsResponse>(`${API_ROOT}/seller-locations`, []);
}
