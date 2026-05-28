/**
 * Burner identity reconciler — periodically retries deactivation of burner
 * accounts whose Matrix deactivation failed during the initial burn attempt.
 *
 * This ensures eventual consistency: even if the homeserver is temporarily
 * unreachable when a user burns their burner, the account will eventually
 * be deactivated on the next reconciliation pass.
 */

import { db } from '../db/store';
import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';

const RECONCILE_INTERVAL_MS = Number(process.env.BURNER_RECONCILE_INTERVAL_MS || 15 * 60 * 1000);

let reconcileTimer: ReturnType<typeof setInterval> | null = null;

async function reconcilePendingBurners(): Promise<void> {
    try {
        const pending = db.listBurnerIdentitiesPendingDeactivation();
        if (pending.length === 0) return;

        log.info('burner.reconciler.run', { pendingCount: pending.length });

        for (const burner of pending) {
            try {
                const result = await matrixClient.deactivateUser(burner.burnerUserId, true);
                if (result.ok) {
                    db.confirmBurnerDeactivation(burner.id);
                    log.info('burner.reconciler.deactivated', { burnerUserId: burner.burnerUserId });
                } else {
                    log.warn('burner.reconciler.retry_failed', {
                        burnerUserId: burner.burnerUserId,
                        reason: result.reason,
                    });
                }
            } catch (error) {
                log.error('burner.reconciler.error', {
                    burnerUserId: burner.burnerUserId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    } catch (error) {
        log.error('burner.reconciler.fatal', {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export function startBurnerReconciler(): void {
    if (reconcileTimer) return;
    reconcileTimer = setInterval(() => void reconcilePendingBurners(), RECONCILE_INTERVAL_MS);
    log.info('burner.reconciler.started', { intervalMs: RECONCILE_INTERVAL_MS });
}

export function stopBurnerReconciler(): void {
    if (reconcileTimer) {
        clearInterval(reconcileTimer);
        reconcileTimer = null;
    }
}
