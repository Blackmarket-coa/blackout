import { getOwncastOriginConfig } from '../integrations/owncast';
import { insertAnalyticsEvents } from './analyticsEvents';
import { log } from '../telemetry/logger';

/**
 * Polls the Owncast origin's public `/api/status` endpoint (no admin auth
 * needed — it exposes `online` + `viewerCount`) and lands one
 * `owncast_viewer_snapshot` event per tick in the analytics warehouse. This is
 * the concurrent-viewers time series the Creator Hub insights read back;
 * per-viewer watch time comes from the client heartbeats, not from here.
 *
 * Single-process by design, like the other schedulers in this directory —
 * multi-replica deployments must gate ownership before enabling this on more
 * than one worker or every replica double-counts the same origin.
 */

export const DEFAULT_INTERVAL_MS = 60 * 1000;

/** Synthetic actor for infrastructure-emitted events (not a real Matrix user). */
export const OWNCAST_SNAPSHOT_ACTOR = '@system:owncast';
export const OWNCAST_SNAPSHOT_EVENT_TYPE = 'owncast_viewer_snapshot';

let timer: ReturnType<typeof setInterval> | null = null;

export type PollOutcome =
    | { kind: 'recorded'; online: boolean; viewerCount: number }
    | { kind: 'skipped'; reason: 'warehouse_disabled' | 'insert_failed' }
    | { kind: 'unreachable' };

export interface RunPollOptions {
    /** Pluggable fetch (tests). */
    fetch?: typeof fetch;
}

export const runOwncastMetricsPoll = async (options: RunPollOptions = {}): Promise<PollOutcome> => {
    const doFetch = options.fetch ?? fetch;
    const { origin } = getOwncastOriginConfig();

    let online: boolean;
    let viewerCount: number;
    try {
        const response = await doFetch(`${origin.replace(/\/+$/, '')}/api/status`);
        if (!response.ok) {
            log.warn('owncast_metrics_status_http_error', { status: response.status });
            return { kind: 'unreachable' };
        }
        const body = (await response.json()) as { online?: boolean; viewerCount?: number };
        online = body.online === true;
        viewerCount = typeof body.viewerCount === 'number' ? body.viewerCount : 0;
    } catch (err) {
        log.warn('owncast_metrics_status_unreachable', { error: String(err) });
        return { kind: 'unreachable' };
    }

    const result = await insertAnalyticsEvents([
        {
            eventType: OWNCAST_SNAPSHOT_EVENT_TYPE,
            occurredAtMs: Date.now(),
            actorMxid: OWNCAST_SNAPSHOT_ACTOR,
            payload: { online, viewerCount },
        },
    ]);
    if (result.kind === 'disabled') return { kind: 'skipped', reason: 'warehouse_disabled' };
    if (result.kind === 'failed') return { kind: 'skipped', reason: 'insert_failed' };
    return { kind: 'recorded', online, viewerCount };
};

/**
 * Start the periodic poller. Idempotent; the timer is `.unref()`'d so it never
 * keeps the process alive on its own.
 */
export const startOwncastMetricsScheduler = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopOwncastMetricsScheduler };
    timer = setInterval(() => {
        void runOwncastMetricsPoll().catch((err) => {
            log.warn('owncast_metrics_tick_threw', { error: String(err) });
        });
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopOwncastMetricsScheduler };
};

export const stopOwncastMetricsScheduler = (): void => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isOwncastMetricsSchedulerRunning = (): boolean => timer !== null;
