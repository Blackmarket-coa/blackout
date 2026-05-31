// Periodic drift-correction loop for the Matrix ACL sync worker. Mirrors
// scheduledMessageDispatcher: single-process, `.unref()`'d interval, idempotent
// start. A multi-replica deployment would need a Postgres advisory lock so two
// replicas don't both reconcile. Gated by the caller (server bootstrap) on
// FBM_ACL_SYNC_ENABLED + a configured entitlements client.

import { reconcileAllAcls } from './index';
import { logEvent } from '../marketplaceObservability';

export const DEFAULT_RECONCILE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let timer: ReturnType<typeof setInterval> | null = null;

export function startFbmAclReconcileLoop(
    intervalMs: number = DEFAULT_RECONCILE_INTERVAL_MS
): { stop: () => void } {
    if (timer) return { stop: stopFbmAclReconcileLoop };
    timer = setInterval(() => {
        void reconcileAllAcls().catch((err) => {
            logEvent('fbm.acl_sync.reconcile_tick_threw', {
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopFbmAclReconcileLoop };
}

export function stopFbmAclReconcileLoop(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

export const isFbmAclReconcileLoopRunning = (): boolean => timer !== null;
