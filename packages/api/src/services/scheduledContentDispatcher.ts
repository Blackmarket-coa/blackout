import { log } from '../telemetry/logger';
import { publishDueScheduledContent } from './creatorContentStore';

/**
 * Background publisher for scheduled creator content. A creator schedules a
 * piece via `POST /v1/creator/content` with `scheduledFor`; this loop flips it
 * to `published` (and guarantees a Home-feed distribution) once that time
 * passes, so a scheduled post goes live even when the creator's client is
 * closed. Mirrors `scheduledMessageDispatcher`: single-process, `.unref()`'d,
 * idempotent start.
 */

export const DEFAULT_INTERVAL_MS = 30 * 1000; // 30 seconds

let timer: ReturnType<typeof setInterval> | null = null;

export const runScheduledContentDispatch = (): { published: number } => {
    const published = publishDueScheduledContent();
    if (published > 0) log.info('scheduled_content_published', { published });
    return { published };
};

export const startScheduledContentDispatcher = (
    intervalMs: number = DEFAULT_INTERVAL_MS,
): { stop: () => void } => {
    if (timer) return { stop: stopScheduledContentDispatcher };
    timer = setInterval(() => {
        try {
            runScheduledContentDispatch();
        } catch (err) {
            log.warn('scheduled_content_dispatch_tick_threw', { error: String(err) });
        }
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopScheduledContentDispatcher };
};

export const stopScheduledContentDispatcher = (): void => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isScheduledContentDispatcherRunning = (): boolean => timer !== null;
