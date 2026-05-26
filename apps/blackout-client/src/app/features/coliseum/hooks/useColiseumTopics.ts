import { useCallback, useEffect, useRef, useState } from 'react';
import {
    fetchColiseumReel,
    fetchColiseumTopic,
    fetchColiseumTopics,
    fetchColiseumVerdict,
    type ColiseumReelItem,
    type ColiseumScopeQuery,
    type ColiseumTopicDetailResponse,
    type ColiseumTopicsResponse,
    type ColiseumVerdictResponse,
    type FetchColiseumTopicsOptions,
} from '../coliseumClient';

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

export type { ColiseumScopeQuery } from '../coliseumClient';

export function useColiseumTopics(
    scope: ColiseumScopeQuery,
    options: FetchColiseumTopicsOptions = {}
) {
    return useAsync<ColiseumTopicsResponse>(
        () => fetchColiseumTopics(scope, options),
        [scope.canopyId, scope.denId, options.category, options.tag, options.status, options.limit]
    );
}

export function useColiseumTopic(topicId: string | null) {
    return useAsync<ColiseumTopicDetailResponse | null>(
        () => (topicId ? fetchColiseumTopic(topicId) : Promise.resolve(null)),
        [topicId]
    );
}

export function useColiseumVerdict(topicId: string | null) {
    return useAsync<ColiseumVerdictResponse | null>(
        () => (topicId ? fetchColiseumVerdict(topicId) : Promise.resolve(null)),
        [topicId]
    );
}

export interface UseColiseumReelResult {
    items: ColiseumReelItem[];
    loading: boolean;
    error: string | null;
    hasMore: boolean;
    loadMore: () => void;
}

/**
 * Paginating cross-topic reel: fetches the first page on mount and appends
 * subsequent pages on demand (driven by the reel's near-bottom scroll). Items
 * are de-duplicated by id so a re-rank between page fetches can't double-insert.
 */
export function useColiseumReel(pageSize = 20): UseColiseumReelResult {
    const [items, setItems] = useState<ColiseumReelItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nextOffset, setNextOffset] = useState<number | null>(0);
    const nextOffsetRef = useRef<number | null>(0);
    const inFlight = useRef(false);
    const seen = useRef<Set<string>>(new Set());

    const loadMore = useCallback(() => {
        if (inFlight.current) return;
        const offset = nextOffsetRef.current;
        if (offset === null) return;
        inFlight.current = true;
        setLoading(true);
        void fetchColiseumReel({ limit: pageSize, offset })
            .then((res) => {
                setItems((prev) => {
                    const merged = [...prev];
                    for (const item of res.items) {
                        if (seen.current.has(item.id)) continue;
                        seen.current.add(item.id);
                        merged.push(item);
                    }
                    return merged;
                });
                nextOffsetRef.current = res.nextOffset;
                setNextOffset(res.nextOffset);
                setError(null);
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Failed to load reel');
            })
            .finally(() => {
                inFlight.current = false;
                setLoading(false);
            });
    }, [pageSize]);

    useEffect(() => {
        loadMore();
        // Mount-only: subsequent pages are pulled via loadMore from the UI.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { items, loading, error, hasMore: nextOffset !== null, loadMore };
}
