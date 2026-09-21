/**
 * Retention for what strangers wrote back.
 *
 * Every row in `coalition_external_activity` is a reply somebody outside the
 * coalition posted on a third-party platform. The coalition asked to read it
 * back; it did not ask to keep it forever, and the author never agreed to
 * either. A stranger's words are not the coalition's to keep indefinitely.
 *
 * **Why the windows exist.** A reply that was rejected, or that nobody ever
 * got round to reviewing, is text the coalition decided not to show — or never
 * decided about at all. Holding onto it is a liability, not an asset: it is
 * somebody else's speech sitting in a database that can be subpoenaed, leaked,
 * or exported, attached to a handle that names them. So `pending` and
 * `rejected` rows are short-lived.
 *
 * **Why `approved` is longer.** An approved reply is part of a public thread
 * the coalition chose to show under its own campaign. The author's words are
 * already public on the platform they were written on, and the coalition has
 * taken a positive decision to surface them. That earns a longer window, not
 * an unlimited one — the thread is a record of a campaign, and campaigns end.
 *
 * **Why the sweep is not gated on the inbound flag.** Rows exist because
 * `BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED` was on at some point. Turning it
 * off stops new rows from arriving; it does not make the ones already held
 * disappear, and the retention obligation is owed for as long as any row
 * exists. If the sweep ran only while the flag was on, disabling two-way sync
 * would freeze every stranger's reply in place indefinitely — the exact
 * opposite of what switching the feature off should mean.
 *
 * **What it never touches.** `coalition_campaign_engagement` holds counts:
 * likes, reshares, reply totals. Nobody wrote them and they name nobody. They
 * are the coalition's own reach and are not subject to this sweep.
 *
 * **What it never logs.** Counts only. No row ids, no authors, no content.
 */
import { db } from '../db/store';
import type { CoalitionExternalActivityRecord } from '../db/types';
import { log } from '../telemetry/logger';
import { INBOUND_READ_WINDOW_DAYS } from './coalitionInboundSync';

/**
 * No window may be shorter than the poller's read window. The origin-id dedupe
 * in `ingestExternalActivity` only sees live rows, so a row purged while the
 * poller is still re-reading its post would be ingested again as new — and a
 * rejected or taken-down reply would be back in the queue. Every reply is
 * younger than its post, so a window at least this long expires a row only
 * after the poller has stopped looking at the post.
 */
export const MIN_WINDOW_DAYS = INBOUND_READ_WINDOW_DAYS;

export const DEFAULT_PENDING_DAYS = 30;
export const DEFAULT_REJECTED_DAYS = 30;
export const DEFAULT_APPROVED_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionWindows {
    pendingDays: number;
    rejectedDays: number;
    approvedDays: number;
}

export interface RetentionSweepResult {
    scanned: number;
    purged: { pending: number; rejected: number; approved: number };
}

/**
 * A window must be a positive integer number of days. Anything else — unset,
 * empty, `abc`, `0`, `-5`, `1.5` — falls back to the default for that key.
 * Zero is refused deliberately: a zero-day window would purge every row on
 * the next sweep, which is not a retention policy but a deletion of the
 * feature by typo.
 */
function positiveIntDays(raw: string | undefined, fallback: number): number {
    if (typeof raw !== 'string') return fallback;
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) return fallback;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Resolve the three windows from the environment. Never throws, never zero,
 * never shorter than `MIN_WINDOW_DAYS` (see above).
 */
export function retentionWindows(env: NodeJS.ProcessEnv = process.env): RetentionWindows {
    const floored = (raw: string | undefined, fallback: number): number =>
        Math.max(positiveIntDays(raw, fallback), MIN_WINDOW_DAYS);
    return {
        pendingDays: floored(
            env.BLACKOUT_COALITION_EXTERNAL_RETENTION_PENDING_DAYS,
            DEFAULT_PENDING_DAYS
        ),
        rejectedDays: floored(
            env.BLACKOUT_COALITION_EXTERNAL_RETENTION_REJECTED_DAYS,
            DEFAULT_REJECTED_DAYS
        ),
        approvedDays: floored(
            env.BLACKOUT_COALITION_EXTERNAL_RETENTION_APPROVED_DAYS,
            DEFAULT_APPROVED_DAYS
        ),
    };
}

type Bucket = keyof RetentionSweepResult['purged'];

/**
 * Which window a row ages under. Anything that is not `approved` or `rejected`
 * is treated as unreviewed and gets the pending window — the shortest — so an
 * unexpected status can only shorten a row's life, never extend it.
 */
function bucketOf(row: CoalitionExternalActivityRecord): Bucket {
    if (row.moderationStatus === 'approved') return 'approved';
    if (row.moderationStatus === 'rejected') return 'rejected';
    return 'pending';
}

/**
 * The instant a row starts ageing from, in epoch ms. Pending and approved rows
 * age from when they arrived. Rejected rows age from when a steward looked at
 * them, so a reply that sat in the queue for a while still gets its full
 * rejected window from the decision rather than expiring the moment it is
 * refused; a rejected row with no review stamp falls back to arrival.
 *
 * An unparsable timestamp yields NaN. The caller treats NaN as "older than
 * any window": a row whose age cannot be established must be purged as if it
 * were the oldest row in the table, because the alternative — skipping it —
 * would make a corrupt or malformed timestamp a way to keep a stranger's
 * words forever.
 */
function anchorOf(row: CoalitionExternalActivityRecord, bucket: Bucket): number {
    const source = bucket === 'rejected' ? row.reviewedAt ?? row.receivedAt : row.receivedAt;
    if (typeof source !== 'string' || source.length === 0) return Number.NaN;
    return Date.parse(source);
}

function isPastDue(row: CoalitionExternalActivityRecord, windows: RetentionWindows, now: number) {
    const bucket = bucketOf(row);
    const anchor = anchorOf(row, bucket);
    // NaN never compares true, so an unparsable anchor is decided here, on
    // purpose, as past due (see anchorOf).
    if (Number.isNaN(anchor)) return { bucket, pastDue: true };
    const windowDays =
        bucket === 'approved'
            ? windows.approvedDays
            : bucket === 'rejected'
            ? windows.rejectedDays
            : windows.pendingDays;
    return { bucket, pastDue: now - anchor > windowDays * DAY_MS };
}

/**
 * Walk every external reply and delete the ones past their window. Runs
 * regardless of whether inbound sync is currently enabled (see the header).
 * Never throws: each row is handled on its own, so one bad row cannot stop
 * the rest of the table from being swept.
 */
export function sweepExternalActivityRetention(now: number = Date.now()): RetentionSweepResult {
    const result: RetentionSweepResult = {
        scanned: 0,
        purged: { pending: 0, rejected: 0, approved: 0 },
    };
    const windows = retentionWindows();

    let rows: CoalitionExternalActivityRecord[];
    try {
        rows = db.listCoalitionExternalActivity();
    } catch (err) {
        log.warn('coalition_external_retention_list_failed', { error: String(err) });
        return result;
    }

    let failed = 0;
    const due = new Map<string, Bucket>();
    for (const row of rows) {
        result.scanned += 1;
        try {
            const { bucket, pastDue } = isPastDue(row, windows, now);
            if (pastDue) due.set(row.id, bucket);
        } catch {
            // Counted, never described: the row's fields are a stranger's and
            // do not belong in a log line.
            failed += 1;
        }
    }

    // One delete for the whole batch. On the durable backends a delete is a
    // whole-table reconcile, so purging N rows one at a time would cost N
    // rewrites of the table; one call costs one.
    if (due.size > 0) {
        try {
            for (const id of db.deleteCoalitionExternalActivities([...due.keys()])) {
                const bucket = due.get(id);
                if (bucket) result.purged[bucket] += 1;
            }
        } catch (err) {
            failed += due.size;
            log.warn('coalition_external_retention_delete_failed', {
                count: due.size,
                error: err instanceof Error ? err.name : 'unknown',
            });
        }
    }

    const purgedTotal = result.purged.pending + result.purged.rejected + result.purged.approved;
    if (purgedTotal > 0) {
        log.info('coalition_external_retention_sweep', {
            scanned: result.scanned,
            purgedPending: result.purged.pending,
            purgedRejected: result.purged.rejected,
            purgedApproved: result.purged.approved,
            failed,
        });
    } else if (failed > 0) {
        log.warn('coalition_external_retention_rows_failed', { scanned: result.scanned, failed });
    }
    return result;
}
