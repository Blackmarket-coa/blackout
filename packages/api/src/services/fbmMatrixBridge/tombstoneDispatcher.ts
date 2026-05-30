// Background sweeper for the FBM → Matrix bridge. Purges expired dead-drop rooms
// (past TTL or already downloaded) and resolved dispute rooms whose retention
// window has elapsed. Mirrors scheduledMessageDispatcher: a single-process
// interval timer, `.unref()`'d, idempotent start. A multi-replica deployment
// would need a Postgres advisory lock to avoid two replicas double-purging.

import { db } from '../../db/store';
import { incrementCounter, logEvent } from '../marketplaceObservability';
import { defaultMatrixClient, type FbmBridgeMatrixClient } from './client';

export const DEFAULT_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let timer: ReturnType<typeof setInterval> | null = null;

export interface SweepResult {
    deaddropsTombstoned: number;
    disputesPurged: number;
}

/**
 * Run a single sweep tick. `purgeRoom` on Synapse is asynchronous (it returns a
 * `delete_id`); we mark our record's intent (`tombstonedAt` / `purgedAt`) once
 * the delete is accepted rather than waiting for the background job to finish.
 */
export async function runFbmTombstoneSweep(
    matrix: FbmBridgeMatrixClient = defaultMatrixClient
): Promise<SweepResult> {
    const now = new Date().toISOString();
    const result: SweepResult = { deaddropsTombstoned: 0, disputesPurged: 0 };

    for (const delivery of db.listFbmDeaddropDeliveriesToTombstone(now)) {
        const purged = await matrix.purgeRoom(delivery.roomId, { block: true, purge: true });
        if (!purged.ok) {
            incrementCounter('fbm_matrix_bridge_action_failed_total', {
                feature: 'tombstone',
                action: 'purge_deaddrop',
            });
            continue;
        }
        db.upsertFbmDeaddropDelivery({ ...delivery, tombstonedAt: now });
        result.deaddropsTombstoned += 1;
    }

    for (const dispute of db.listFbmDisputeRoomsToPurge(now)) {
        const purged = await matrix.purgeRoom(dispute.roomId, { block: true, purge: true });
        if (!purged.ok) {
            incrementCounter('fbm_matrix_bridge_action_failed_total', {
                feature: 'tombstone',
                action: 'purge_dispute',
            });
            continue;
        }
        db.upsertFbmDisputeRoom({ ...dispute, purgedAt: now });
        result.disputesPurged += 1;
    }

    if (result.deaddropsTombstoned > 0 || result.disputesPurged > 0) {
        incrementCounter('fbm_matrix_tombstone_swept_total', {}, result.deaddropsTombstoned + result.disputesPurged);
        logEvent('marketplace.fbm_bridge.tombstone_swept', { ...result });
    }
    return result;
}

export function startFbmTombstoneDispatcher(
    intervalMs: number = DEFAULT_SWEEP_INTERVAL_MS
): { stop: () => void } {
    if (timer) return { stop: stopFbmTombstoneDispatcher };
    timer = setInterval(() => {
        void runFbmTombstoneSweep().catch((err) => {
            logEvent('marketplace.fbm_bridge.tombstone_tick_threw', {
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopFbmTombstoneDispatcher };
}

export function stopFbmTombstoneDispatcher(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

export const isFbmTombstoneDispatcherRunning = (): boolean => timer !== null;
