/**
 * Dedicated background-worker entrypoint.
 *
 * Runs the same periodic job loops the API can run in-process (see
 * backgroundLoops.ts) but without the HTTP server, so the production `worker`
 * service owns scheduled-message delivery, the dead-man sweep, the retention
 * sweeps, the FBM sweepers and the ACL reconcile loop while the `app` +
 * `app_canary` replicas (started with BLACKOUT_BACKGROUND_WORKERS_DISABLED=1)
 * handle requests only. backgroundWorker.ts loads the store before any loop
 * starts, takes the background-leader lock, and drains on SIGTERM/SIGINT.
 *
 * Liveness: once the store is loaded, a heartbeat file is rewritten on an
 * interval; bin/worker-healthcheck fails the container healthcheck if the
 * heartbeat goes missing or stale.
 */
import { createBackgroundWorker } from './backgroundWorker';
import { log } from './telemetry/logger';

const shutdownTimeoutMs = Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '', 10);

const worker = createBackgroundWorker({
    heartbeatPath: process.env.WORKER_HEARTBEAT_PATH ?? '/tmp/blackout-worker.heartbeat',
    shutdownTimeoutMs:
        Number.isFinite(shutdownTimeoutMs) && shutdownTimeoutMs > 0 ? shutdownTimeoutMs : undefined,
});

// Registered before the boot, so a signal that arrives while the store is
// still loading is handled the same way: nothing starts, the worker drains
// and exits.
process.once('SIGTERM', () => void worker.shutdown('SIGTERM'));
process.once('SIGINT', () => void worker.shutdown('SIGINT'));

worker.start().catch((err) => {
    log.error('blackout_worker_boot_failed', {
        error: err instanceof Error ? err.message : String(err),
    });
    void worker.shutdown('boot_failed', 1);
});
