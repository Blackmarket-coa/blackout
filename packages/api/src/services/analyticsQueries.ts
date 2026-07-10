import { readClickhouseRuntimeConfig } from '../config/clickhouse';
import { log } from '../telemetry/logger';

/**
 * Read side of the analytics warehouse: creator-facing aggregates over the
 * events landed by `analyticsEvents.ts` (client view events) and the Owncast
 * snapshot poller. Same posture as the write side — a missing or unreachable
 * warehouse yields `null`, never an exception, so callers degrade to an
 * "insights unavailable" UI instead of a 500.
 */

export interface CreatorAnalyticsSummary {
    /** Window the aggregates cover, in days. */
    days: number;
    /** `stream_view_started` events for this creator's streams. */
    streamViews: number;
    /** Distinct signed-in accounts that started watching or heartbeated. */
    uniqueViewers: number;
    /** Sum of heartbeat seconds — wall-clock watch time across all viewers. */
    watchSeconds: number;
    /** `clip_play_started` events for this creator's clips. */
    clipPlays: number;
    /** Peak Owncast concurrent viewers in the window (instance-wide). */
    peakConcurrentViewers: number;
    /** Viewers on the Owncast origin right now (snapshot ≤5 min old), or null when no fresh snapshot. */
    liveViewersNow: number | null;
}

interface ClickhouseJsonResult<TRow> {
    data?: TRow[];
}

const runSelect = async <TRow>(
    sql: string,
    params: Record<string, string>
): Promise<TRow[] | null> => {
    const config = readClickhouseRuntimeConfig();
    if (!config.url) return null;

    const url = new URL(config.url);
    url.searchParams.set('query', sql);
    url.searchParams.set('database', config.database);
    // Plain JS numbers instead of quoted 64-bit strings in FORMAT JSON output.
    url.searchParams.set('output_format_json_quote_64bit_integers', '0');
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(`param_${key}`, value);
    }
    const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { authorization: `Basic ${auth}` },
        });
        if (!response.ok) {
            const detail = (await response.text().catch(() => '')).slice(0, 300);
            log.warn('analytics_query_failed', { status: response.status, detail });
            return null;
        }
        const body = (await response.json()) as ClickhouseJsonResult<TRow>;
        return body.data ?? [];
    } catch (err) {
        log.warn('analytics_query_failed', { error: String(err) });
        return null;
    }
};

const toCount = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

interface SummaryRow {
    stream_views: unknown;
    unique_viewers: unknown;
    watch_seconds: unknown;
    clip_plays: unknown;
    peak_concurrent: unknown;
}

interface SnapshotRow {
    online: unknown;
    viewer_count: unknown;
}

export const queryCreatorSummary = async (
    creatorId: string,
    days: number
): Promise<CreatorAnalyticsSummary | null> => {
    const summaryRows = await runSelect<SummaryRow>(
        `SELECT
        countIf(event_type = 'stream_view_started'
            AND JSONExtractString(payload, 'creatorId') = {creator:String}) AS stream_views,
        uniqExactIf(actor_mxid, event_type IN ('stream_view_started', 'stream_view_heartbeat')
            AND JSONExtractString(payload, 'creatorId') = {creator:String}) AS unique_viewers,
        sumIf(JSONExtractInt(payload, 'seconds'), event_type = 'stream_view_heartbeat'
            AND JSONExtractString(payload, 'creatorId') = {creator:String}) AS watch_seconds,
        countIf(event_type = 'clip_play_started'
            AND JSONExtractString(payload, 'creatorId') = {creator:String}) AS clip_plays,
        maxIf(JSONExtractInt(payload, 'viewerCount'),
            event_type = 'owncast_viewer_snapshot') AS peak_concurrent
     FROM events
     WHERE occurred_at >= now64(3) - INTERVAL {days:UInt32} DAY
     FORMAT JSON`,
        { creator: creatorId, days: String(days) }
    );
    if (summaryRows === null) return null;

    const snapshotRows = await runSelect<SnapshotRow>(
        `SELECT
        JSONExtractBool(payload, 'online') AS online,
        JSONExtractInt(payload, 'viewerCount') AS viewer_count
     FROM events
     WHERE event_type = 'owncast_viewer_snapshot'
       AND occurred_at >= now64(3) - INTERVAL 5 MINUTE
     ORDER BY occurred_at DESC
     LIMIT 1
     FORMAT JSON`,
        {}
    );

    const summary = summaryRows[0];
    const snapshot = snapshotRows?.[0];
    return {
        days,
        streamViews: toCount(summary?.stream_views),
        uniqueViewers: toCount(summary?.unique_viewers),
        watchSeconds: toCount(summary?.watch_seconds),
        clipPlays: toCount(summary?.clip_plays),
        peakConcurrentViewers: toCount(summary?.peak_concurrent),
        liveViewersNow: snapshot ? toCount(snapshot.viewer_count) : null,
    };
};
