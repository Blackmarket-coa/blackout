/**
 * WHAT THIS FILE DOES
 * A background task that runs every 15 minutes, retrying the
 * deactivation of burner accounts where the initial "burn" attempt
 * failed because the Matrix homeserver was unreachable.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * When a user "burns" their burner identity, two things happen:
 *   1. LOCAL: We mark it as burned and free up the user's burner slot.
 *   2. REMOTE: We tell the Matrix homeserver to deactivate the account.
 * If step 2 fails (network blip, homeserver restart), the burner
 * account still exists on the homeserver — orphaned and un-managed.
 *
 * Without this reconciler, orphaned burner accounts would accumulate
 * indefinitely, consuming homeserver resources and potentially
 * violating data retention policies. The reconciler ensures eventual
 * consistency: even if the initial deactivation fails, the account
 * will be deactivated on the next 15-minute reconciliation pass.
 *
 * KEY CONCEPT — Eventual consistency
 * A system design pattern where, if a write fails temporarily, a
 * background process ensures it eventually succeeds. Contrast with
 * "strong consistency" where every operation either succeeds
 * immediately or the entire request fails. Eventual consistency is
 * appropriate here because burner deactivation is not time-critical.
 *
 * HOW TO VERIFY
 * 1. Create a burner identity.
 * 2. Stop the Matrix homeserver (simulate network failure).
 * 3. Burn the burner — it will be marked locally but deactivation
 *    will fail, setting `deactivationPending: true`.
 * 4. Restart the homeserver.
 * 5. Wait up to 15 minutes (or the configured interval).
 * 6. Check that the burner is fully deactivated on the homeserver.
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
