import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';

export type HomeTourStatus = 'idle' | 'running' | 'completed' | 'dismissed';

export interface HomeTourState {
    status: HomeTourStatus;
    stepIndex: number;
    startedAt: number;
    completedAt?: number;
    updatedAt: number;
}

const ACCOUNT_DATA_KEY = 'co.bmc.onboarding.home_tour.v1';
const LOCAL_STORAGE_KEY = 'co.bmc.onboarding.home_tour.local.v1';

const buildDefaultState = (): HomeTourState => ({
    status: 'idle',
    stepIndex: 0,
    startedAt: 0,
    updatedAt: 0,
});

const isHomeTourStatus = (value: unknown): value is HomeTourStatus =>
    value === 'idle' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'dismissed';

const normalize = (value: unknown): HomeTourState => {
    const fallback = buildDefaultState();
    if (!value || typeof value !== 'object') return fallback;
    const entry = value as Partial<HomeTourState>;
    return {
        status: isHomeTourStatus(entry.status) ? entry.status : fallback.status,
        stepIndex: typeof entry.stepIndex === 'number' && entry.stepIndex >= 0 ? entry.stepIndex : 0,
        startedAt: typeof entry.startedAt === 'number' ? entry.startedAt : 0,
        completedAt: typeof entry.completedAt === 'number' ? entry.completedAt : undefined,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : fallback.updatedAt,
    };
};

const readLocal = (): HomeTourState => {
    if (typeof window === 'undefined') return buildDefaultState();
    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return buildDefaultState();
        return normalize(JSON.parse(raw));
    } catch {
        return buildDefaultState();
    }
};

const writeLocal = (state: HomeTourState) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
};

// Module-level pub/sub so every `useHomeTour()` caller shares the same
// in-memory snapshot — the replay button in `HomeFeed` and the portal
// overlay must observe the same state transitions.
let currentState: HomeTourState = buildDefaultState();
const listeners = new Set<() => void>();

const notify = () => {
    listeners.forEach((listener) => listener());
};

const setStoreState = (next: HomeTourState) => {
    currentState = next;
    notify();
};

const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = (): HomeTourState => currentState;

/**
 * Test-only helper. Resets both the in-memory store and the persisted
 * localStorage entry so tests get a clean slate per case.
 */
export const __resetHomeTourStateForTests = () => {
    currentState = buildDefaultState();
    if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    notify();
};

// Re-hydrate from localStorage when the module first loads so a page
// reload after a completed/dismissed tour keeps that status.
if (typeof window !== 'undefined') {
    currentState = readLocal();
}

export const useHomeTour = () => {
    const client = useMatrixClientOrNull();
    const accountDataClient = client as unknown as {
        getAccountData: (type: string) => { getContent: () => unknown } | undefined;
        setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
    } | null;

    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        if (!accountDataClient) return;
        const remote = accountDataClient.getAccountData(ACCOUNT_DATA_KEY)?.getContent();
        if (remote) {
            const normalized = normalize(remote);
            setStoreState(normalized);
            writeLocal(normalized);
        }
    }, [accountDataClient]);

    const persist = useCallback(
        async (next: HomeTourState) => {
            writeLocal(next);
            setStoreState(next);
            if (!accountDataClient) return;
            try {
                await accountDataClient.setAccountData(ACCOUNT_DATA_KEY, { ...next });
            } catch {
                // Best-effort sync; localStorage already holds the truth for
                // single-device beta testers.
            }
        },
        [accountDataClient]
    );

    const start = useCallback(async () => {
        const now = Date.now();
        await persist({
            status: 'running',
            stepIndex: 0,
            startedAt: now,
            updatedAt: now,
        });
    }, [persist]);

    const advance = useCallback(
        async (totalSteps: number) => {
            const next = state.stepIndex + 1;
            if (next >= totalSteps) {
                const now = Date.now();
                await persist({
                    ...state,
                    status: 'completed',
                    stepIndex: totalSteps - 1,
                    completedAt: now,
                    updatedAt: now,
                });
                return;
            }
            await persist({
                ...state,
                stepIndex: next,
                updatedAt: Date.now(),
            });
        },
        [persist, state]
    );

    const goBack = useCallback(async () => {
        const prev = Math.max(0, state.stepIndex - 1);
        await persist({
            ...state,
            stepIndex: prev,
            updatedAt: Date.now(),
        });
    }, [persist, state]);

    const skip = useCallback(async () => {
        await persist({
            ...state,
            status: 'dismissed',
            updatedAt: Date.now(),
        });
    }, [persist, state]);

    const reset = useCallback(async () => {
        await persist(buildDefaultState());
    }, [persist]);

    return useMemo(
        () => ({
            state,
            start,
            advance,
            goBack,
            skip,
            reset,
        }),
        [advance, goBack, reset, skip, start, state]
    );
};
