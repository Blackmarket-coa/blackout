/**
 * Dedicated background-worker entrypoint.
 *
 * Runs the same periodic job loops the API serves in-process (see
 * backgroundLoops.ts) but without the HTTP server, so the production `worker`
 * service owns scheduled-message delivery, the FBM sweepers and the ACL
 * reconcile loop while the `app` + `app_canary` replicas (started with
 * BLACKOUT_BACKGROUND_WORKERS_DISABLED=1) handle requests only.
 *
 * Liveness: a heartbeat file is rewritten on an interval; bin/worker-healthcheck
 * fails the container healthcheck if the heartbeat goes missing or stale.
 */
import { writeFileSync } from 'node:fs';

import { startBackgroundLoops } from './backgroundLoops';
import { log } from './telemetry/logger';

const HEARTBEAT_PATH = process.env.WORKER_HEARTBEAT_PATH ?? '/tmp/blackout-worker.heartbeat';
const HEARTBEAT_INTERVAL_MS = 15_000;

function writeHeartbeat(): void {
  try {
    writeFileSync(HEARTBEAT_PATH, `${Date.now()}\n`);
  } catch (err) {
    log.warn('worker_heartbeat_write_failed', { error: String(err), path: HEARTBEAT_PATH });
  }
}

startBackgroundLoops();
writeHeartbeat();
// The heartbeat interval also keeps the event loop alive even when every loop
// is configured off, so the worker container stays up (and reports healthy)
// instead of exiting and crash-looping.
const heartbeat = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
log.info('blackout_worker_started', { heartbeatPath: HEARTBEAT_PATH });

function shutdown(signal: string): void {
  clearInterval(heartbeat);
  log.info('blackout_worker_stopping', { signal });
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
