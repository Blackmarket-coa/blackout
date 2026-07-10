import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { getAuthUser, requireUser } from '../middleware/require-user';
import { createRateLimit } from '../middleware/rate-limit';
import { insertAnalyticsEvents, type AnalyticsEventInput } from '../services/analyticsEvents';

const telemetry = new Hono();

// Batches arrive at most every few seconds per client; keyed on user so one
// noisy tab can't starve the shared IP bucket. Override with
// TELEMETRY_RATE_LIMIT_MAX.
const telemetryMax = Number.parseInt(process.env.TELEMETRY_RATE_LIMIT_MAX ?? '', 10);
const telemetryRateLimit = createRateLimit({
    bucket: 'telemetry',
    windowMs: 60_000,
    maxRequests: Number.isFinite(telemetryMax) && telemetryMax > 0 ? telemetryMax : 60,
    identify: (c) => getAuthUser(c)?.sub ?? null,
});
telemetry.use('/events', telemetryRateLimit);

const MAX_BATCH = 50;
/** Events older than this (or from the future) get their timestamp clamped server-side. */
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

const eventSchema = z.object({
    /** Namespaced snake_case, e.g. `feed_item_impression`, `stream_view_heartbeat`. */
    eventType: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z][a-z0-9_]*$/, 'eventType must be lower snake_case'),
    /** Client-side epoch milliseconds; clamped to a ±24h window on ingest. */
    occurredAtMs: z.number().int().positive(),
    coalitionId: z.string().min(1).max(255).optional(),
    /** Small structured context (item id, source, duration…). Kept opaque in the warehouse. */
    payload: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
    events: z.array(eventSchema).min(1).max(MAX_BATCH),
});

const clampOccurredAt = (occurredAtMs: number, now: number): number => {
    if (occurredAtMs > now) return now;
    if (occurredAtMs < now - MAX_EVENT_AGE_MS) return now - MAX_EVENT_AGE_MS;
    return occurredAtMs;
};

/**
 * Batch ingest for client view/interaction events → analytics warehouse.
 * Always answers 202 once the batch passes validation: telemetry is
 * fire-and-forget for the client, and warehouse trouble must never surface as
 * a user-facing error. `persisted` tells the truth for observability.
 */
telemetry.post('/events', async (c) => {
    const user = requireUser(c, 'Sign in to report telemetry');
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, batchSchema);
    if (parsed instanceof Response) return parsed;

    const now = Date.now();
    const events: AnalyticsEventInput[] = parsed.events.map((event) => ({
        eventType: event.eventType,
        occurredAtMs: clampOccurredAt(event.occurredAtMs, now),
        actorMxid: user.sub,
        coalitionId: event.coalitionId ?? null,
        payload: event.payload,
    }));

    const result = await insertAnalyticsEvents(events);
    return c.json(
        {
            accepted: parsed.events.length,
            persisted: result.kind === 'inserted',
        },
        202
    );
});

export default telemetry;
