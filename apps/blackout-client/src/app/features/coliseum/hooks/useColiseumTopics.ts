import { useCallback, useEffect, useRef, useState } from 'react';
import {
    fetchColiseumTopic,
    fetchColiseumTopics,
    fetchColiseumVerdict,
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
    options: FetchColiseumTopicsOptions = {},
) {
    return useAsync<ColiseumTopicsResponse>(
        () => fetchColiseumTopics(scope, options),
        [scope.canopyId, scope.denId, options.category, options.tag, options.status, options.limit],
    );
}

export function useColiseumTopic(topicId: string | null) {
    return useAsync<ColiseumTopicDetailResponse | null>(
        () => (topicId ? fetchColiseumTopic(topicId) : Promise.resolve(null)),
        [topicId],
    );
}

export function useColiseumVerdict(topicId: string | null) {
    return useAsync<ColiseumVerdictResponse | null>(
        () => (topicId ? fetchColiseumVerdict(topicId) : Promise.resolve(null)),
        [topicId],
    );
}
