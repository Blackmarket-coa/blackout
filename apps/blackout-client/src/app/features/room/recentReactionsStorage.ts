/**
 * Recent-reactions device-persistent storage — closes the "recent
 * reactions persist per device" exit criterion in Workstream C
 * (deferred-bodies-schedule-2026-05-01.md).
 *
 * Pure module: no React, no Matrix client coupling. Reads + writes a
 * single localStorage key holding the most-recently-used emoji list,
 * MRU-ordered, capped at `MAX_RECENT_REACTIONS`. Falls back gracefully
 * when storage is unavailable (SSR, private mode, quota exceeded) so
 * the reaction picker always has a usable seed.
 */

const STORAGE_KEY = 'blackout.reactions.recent';
const MAX_RECENT_REACTIONS = 12;
export const DEFAULT_RECENT_REACTIONS: readonly string[] = [
    '👍',
    '❤️',
    '😂',
    '🎉',
    '👀',
    '🔥',
];

const isBrowser = (): boolean =>
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined';

const readStorage = (): Storage | null => {
    if (!isBrowser()) return null;
    try {
        return (globalThis as unknown as { localStorage: Storage }).localStorage;
    } catch {
        return null;
    }
};

/**
 * Returns the recent-reactions list from localStorage, or the default
 * seed when no value is stored or the stored value is malformed.
 * Always returns a fresh array (never the readonly default reference)
 * so callers can pass it straight into `useState`.
 */
export function loadRecentReactions(): string[] {
    const storage = readStorage();
    if (!storage) return [...DEFAULT_RECENT_REACTIONS];
    let raw: string | null;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        return [...DEFAULT_RECENT_REACTIONS];
    }
    if (raw === null) return [...DEFAULT_RECENT_REACTIONS];
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [...DEFAULT_RECENT_REACTIONS];
    }
    if (!Array.isArray(parsed)) return [...DEFAULT_RECENT_REACTIONS];
    const cleaned = parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (cleaned.length === 0) return [...DEFAULT_RECENT_REACTIONS];
    return cleaned.slice(0, MAX_RECENT_REACTIONS);
}

/**
 * Persists the recent-reactions list to localStorage. Silently no-ops
 * when storage is unavailable or quota is exceeded so callers don't
 * need to wrap the call.
 */
export function saveRecentReactions(list: readonly string[]): void {
    const storage = readStorage();
    if (!storage) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT_REACTIONS)));
    } catch {
        /* quota exceeded or storage disabled — silent drop */
    }
}

/**
 * MRU update: returns a new list with `emoji` at the front, dropping
 * any prior occurrence, and clamped to the maximum length. Pure — does
 * not write to storage. Callers that want to persist should follow
 * with `saveRecentReactions(next)`.
 */
export function pushRecentReaction(
    current: readonly string[],
    emoji: string,
    maxLength: number = MAX_RECENT_REACTIONS,
): string[] {
    const trimmed = emoji.trim();
    if (!trimmed) return [...current];
    const without = current.filter((value) => value !== trimmed);
    return [trimmed, ...without].slice(0, Math.max(1, maxLength));
}

export { MAX_RECENT_REACTIONS };
