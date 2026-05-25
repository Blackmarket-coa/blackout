import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';
import { trackHomeStreakIncremented } from './homeFeedTelemetry';

export interface StreakState {
    count: number;
    /** Integer UTC day index of the last counted visit (epoch-day). */
    lastActiveDay: number;
    updatedAt: number;
}

export const STREAK_ACCOUNT_DATA_KEY = 'co.bmc.retention.streak.v1';
const ACCOUNT_DATA_KEY = STREAK_ACCOUNT_DATA_KEY;
const LOCAL_STORAGE_KEY = 'co.bmc.retention.streak.local.v1';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch-day index for a timestamp (UTC). */
export const dayNumber = (timestamp: number): number => Math.floor(timestamp / DAY_MS);

const buildDefaultState = (): StreakState => ({
    count: 0,
    // A sentinel that is never `today - 1`, so the first visit always starts a
    // fresh streak of 1 rather than extending a phantom one.
    lastActiveDay: Number.NEGATIVE_INFINITY,
    updatedAt: 0,
});

/**
 * Pure streak transition. Given the previous state and today's epoch-day:
 *   - same day  → unchanged (returns the same reference).
 *   - yesterday → count + 1 (streak continues).
 *   - otherwise → reset to 1 (gap, or first ever visit).
 */
export const computeStreak = (prev: StreakState, todayDay: number, now: number): StreakState => {
    if (prev.lastActiveDay === todayDay) return prev;
    const continues = todayDay === prev.lastActiveDay + 1;
    return {
        count: continues ? prev.count + 1 : 1,
        lastActiveDay: todayDay,
        updatedAt: now,
    };
};

const normalize = (value: unknown): StreakState => {
    const fallback = buildDefaultState();
    if (!value || typeof value !== 'object') return fallback;
    const entry = value as Partial<StreakState>;
    return {
        count: typeof entry.count === 'number' && entry.count >= 0 ? entry.count : 0,
        lastActiveDay:
            typeof entry.lastActiveDay === 'number' ? entry.lastActiveDay : fallback.lastActiveDay,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
    };
};

const readLocal = (): StreakState => {
    if (typeof window === 'undefined') return buildDefaultState();
    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return buildDefaultState();
        return normalize(JSON.parse(raw));
    } catch {
        return buildDefaultState();
    }
};

const writeLocal = (state: StreakState) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
};

let currentState: StreakState = buildDefaultState();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const setStoreState = (next: StreakState) => {
    currentState = next;
    notify();
};
const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
const getSnapshot = (): StreakState => currentState;

export const __resetStreakStateForTests = () => {
    currentState = buildDefaultState();
    if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    notify();
};

if (typeof window !== 'undefined') {
    currentState = readLocal();
}

/**
 * Tracks a consecutive-day visit streak. On mount (when `enabled`), rolls the
 * streak forward for today and persists it to Matrix account data +
 * localStorage. No-ops entirely when disabled so the flag fully gates the
 * side effect.
 */
export const useStreak = (enabled: boolean): StreakState => {
    const client = useMatrixClientOrNull();
    const accountDataClient = client as unknown as {
        getAccountData: (type: string) => { getContent: () => unknown } | undefined;
        setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
    } | null;

    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        if (!enabled) return;
        let base = currentState;
        if (accountDataClient) {
            const remote = accountDataClient.getAccountData(ACCOUNT_DATA_KEY)?.getContent();
            if (remote) base = normalize(remote);
        }
        const now = Date.now();
        const next = computeStreak(base, dayNumber(now), now);
        if (next === base) {
            // Already counted today — make sure the store reflects the
            // (possibly remote-hydrated) base.
            setStoreState(base);
            writeLocal(base);
            return;
        }
        setStoreState(next);
        writeLocal(next);
        trackHomeStreakIncremented(next.count);
        if (accountDataClient) {
            void accountDataClient.setAccountData(ACCOUNT_DATA_KEY, { ...next }).catch(() => {
                // Best-effort sync; localStorage holds the truth for
                // single-device beta testers.
            });
        }
    }, [enabled, accountDataClient]);

    return useMemo(() => state, [state]);
};
