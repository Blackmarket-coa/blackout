import { API_BASE_URL } from './apiBaseUrl';
import { ensureBlackoutApiToken, isBlackoutTokenExpired } from '../../client/blackoutApiSession';
import { readBlackoutApiToken } from '../features/monetization/marketplace/useMarketplaceAuth';

/**
 * Batched view/interaction event transport → `POST /v1/telemetry/events` →
 * analytics warehouse. Fire-and-forget by design: failures are dropped, never
 * surfaced to the user, and never retried into a storm. Lives in the `sdk/`
 * layer (like `fetchAuthorizedBlob`) because the flush path needs raw `fetch`
 * with `keepalive` for unload delivery, which the JSON `ApiClient` can't do.
 */

export interface ViewEvent {
    eventType: string;
    occurredAtMs: number;
    coalitionId?: string;
    payload?: Record<string, unknown>;
}

/** Server caps batches at 50; flush eagerly well before that. */
const MAX_BATCH = 50;
const FLUSH_AFTER_COUNT = 25;
const FLUSH_INTERVAL_MS = 5_000;

let queue: ViewEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersArmed = false;
/** Session-scoped dedupe so a re-rendering list doesn't re-fire impressions. */
const seenDedupeKeys = new Set<string>();

const takeBatch = (): ViewEvent[] => {
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(batch.length);
    return batch;
};

const postBatch = (batch: ViewEvent[], token: string, keepalive: boolean): void => {
    void fetch(`${API_BASE_URL}/v1/telemetry/events`, {
        method: 'POST',
        keepalive,
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ events: batch }),
    }).catch(() => {
        // Telemetry is best-effort: dropping a batch is fine, blocking UX is not.
    });
};

const flushAsync = async (): Promise<void> => {
    if (queue.length === 0) return;
    const stored = readBlackoutApiToken();
    const token =
        stored && !isBlackoutTokenExpired(stored) ? stored : await ensureBlackoutApiToken();
    if (!token) return; // Not signed in (yet) — keep queueing; unload drops silently.
    while (queue.length > 0) postBatch(takeBatch(), token, false);
};

/** Unload path: no awaits available, so only a valid stored token can be used. */
const flushOnUnload = (): void => {
    if (queue.length === 0) return;
    const token = readBlackoutApiToken();
    if (!token || isBlackoutTokenExpired(token)) return;
    while (queue.length > 0) postBatch(takeBatch(), token, true);
};

const armListeners = (): void => {
    if (listenersArmed || typeof document === 'undefined') return;
    listenersArmed = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushOnUnload();
    });
    window.addEventListener('pagehide', flushOnUnload);
};

const scheduleFlush = (): void => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushAsync();
    }, FLUSH_INTERVAL_MS);
};

/**
 * Queue a view event for batched delivery. `dedupeKey` (e.g.
 * `impression:coalition:x`) suppresses repeats for the rest of the session —
 * pass one for impression-style events, omit for genuinely repeatable events
 * (heartbeats, plays).
 */
export const recordViewEvent = (
    eventType: string,
    payload?: Record<string, unknown>,
    options: { coalitionId?: string; dedupeKey?: string } = {}
): void => {
    if (typeof window === 'undefined') return;
    if (options.dedupeKey) {
        if (seenDedupeKeys.has(options.dedupeKey)) return;
        seenDedupeKeys.add(options.dedupeKey);
    }
    queue.push({
        eventType,
        occurredAtMs: Date.now(),
        coalitionId: options.coalitionId,
        payload,
    });
    armListeners();
    if (queue.length >= FLUSH_AFTER_COUNT) {
        if (flushTimer !== null) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        void flushAsync();
        return;
    }
    scheduleFlush();
};

/** Test-only: reset module state between cases. */
export const __resetViewEventsForTests = (): void => {
    queue = [];
    seenDedupeKeys.clear();
    if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
};
