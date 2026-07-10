import { randomUUID } from 'node:crypto';
import { readClickhouseRuntimeConfig } from '../config/clickhouse';
import { log } from '../telemetry/logger';
import { analyticsEventsIngestedTotal, analyticsEventsDroppedTotal } from '../telemetry/metrics';

/** One row for `analytics_raw.events` (see infra clickhouse/initdb/01-analytics-database.sql). */
export interface AnalyticsEventInput {
    eventType: string;
    /** Epoch milliseconds. Callers are expected to have clamped this to a sane window. */
    occurredAtMs: number;
    actorMxid: string;
    coalitionId?: string | null;
    payload?: Record<string, unknown>;
}

/** DateTime64(3) in ClickHouse's default "basic" input format: `YYYY-MM-DD HH:MM:SS.mmm` UTC. */
const toClickhouseDateTime64 = (epochMs: number): string =>
    new Date(epochMs).toISOString().replace('T', ' ').replace('Z', '');

export type AnalyticsInsertResult =
    | { kind: 'inserted'; count: number }
    | { kind: 'disabled' }
    | { kind: 'failed'; reason: string };

/**
 * Fire-and-forget batch insert into the analytics warehouse over ClickHouse's
 * HTTP interface (JSONEachRow). Telemetry must never take user traffic down:
 * an unconfigured warehouse is a silent no-op and errors are logged + counted,
 * never thrown.
 */
export async function insertAnalyticsEvents(
    events: readonly AnalyticsEventInput[]
): Promise<AnalyticsInsertResult> {
    if (events.length === 0) return { kind: 'inserted', count: 0 };

    const config = readClickhouseRuntimeConfig();
    if (!config.url) return { kind: 'disabled' };

    const rows = events
        .map((event) =>
            JSON.stringify({
                event_id: randomUUID(),
                event_type: event.eventType,
                occurred_at: toClickhouseDateTime64(event.occurredAtMs),
                actor_mxid: event.actorMxid,
                coalition_id: event.coalitionId ?? null,
                payload: JSON.stringify(event.payload ?? {}),
            })
        )
        .join('\n');

    const query = `INSERT INTO ${config.database}.events FORMAT JSONEachRow`;
    const url = `${config.url}/?query=${encodeURIComponent(query)}`;
    const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                authorization: `Basic ${auth}`,
                'content-type': 'application/x-ndjson',
            },
            body: rows,
        });
        if (!response.ok) {
            const detail = (await response.text().catch(() => '')).slice(0, 300);
            analyticsEventsDroppedTotal.inc({ reason: 'http_error' }, events.length);
            log.warn('analytics_events_insert_failed', { status: response.status, detail });
            return { kind: 'failed', reason: `clickhouse_http_${response.status}` };
        }
        analyticsEventsIngestedTotal.inc({}, events.length);
        return { kind: 'inserted', count: events.length };
    } catch (err) {
        analyticsEventsDroppedTotal.inc({ reason: 'network_error' }, events.length);
        log.warn('analytics_events_insert_failed', { error: String(err) });
        return { kind: 'failed', reason: 'network_error' };
    }
}
