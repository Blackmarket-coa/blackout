/**
 * Periodic prune of auth rows that have expired.
 *
 * Three tables hold rows whose expiry is checked whenever they are read but
 * which, until 2026-10-25, nothing ever removed (D2 in
 * docs/black-mask-account-link-design.md §7 and
 * docs/security/api-findings-triage-2026-10-25.md): the revoked-session
 * denylist (`revokedSessions`, one row per revoked access token plus the
 * per-user "logout everywhere" cutoff), pending OAuth link state
 * (`pendingOAuthLinks`, one row per started third-party link) and pending
 * native-OIDC login state (`pendingOidcLogins`). Only growth was affected: an
 * expired row answers "not revoked" / "not found" already. The store's
 * `prune*` helpers existed with no caller; this is the caller.
 *
 * Mirrors the other sweeps here (idempotent start/stop around a setInterval
 * with an overlap guard, first pass at start so a process recycled more often
 * than the interval still prunes). It runs under the same leader discipline as
 * every loop `startBackgroundLoops` starts: one process holds the
 * background-leader lock (services/backgroundLeader.ts), and in postgres mode
 * each prune is written through as a resync of its table. The tick is
 * synchronous, so the worker's drain (services/backgroundTicks.ts) has nothing
 * to wait for.
 */
import { db } from '../db/store';
import { log } from '../telemetry/logger';

export const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** The largest delay Node's timers honour; past it a timer fires every millisecond. */
export const MAX_TIMER_MS = 2_147_483_647;

export type AuthRowsPruneResult = {
    revokedSessions: number;
    pendingOAuthLinks: number;
    pendingOidcLogins: number;
};

/** Run one prune pass at `now`. Returns how many rows each table lost. */
export const runAuthRowsPrune = (now: Date = new Date()): AuthRowsPruneResult => {
    const result: AuthRowsPruneResult = {
        revokedSessions: db.pruneExpiredRevokedSessions(now),
        pendingOAuthLinks: db.prunePendingOAuthLinks(now),
        pendingOidcLogins: db.prunePendingOidcLogins(now),
    };
    if (result.revokedSessions + result.pendingOAuthLinks + result.pendingOidcLogins > 0) {
        log.info('auth_rows_pruned', result);
    }
    return result;
};

let timer: ReturnType<typeof setInterval> | null = null;
let firstPass: ReturnType<typeof setTimeout> | null = null;
let running = false;

function tick(): void {
    if (running) return;
    running = true;
    try {
        runAuthRowsPrune();
    } catch (err) {
        log.warn('auth_rows_prune_tick_threw', { error: String(err) });
    } finally {
        running = false;
    }
}

export const startAuthRowsPruneScheduler = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopAuthRowsPruneScheduler };
    const delay = Number.isFinite(intervalMs)
        ? Math.min(Math.max(1, Math.floor(intervalMs)), MAX_TIMER_MS)
        : DEFAULT_INTERVAL_MS;
    firstPass = setTimeout(() => {
        firstPass = null;
        tick();
    }, 0);
    if (typeof firstPass.unref === 'function') firstPass.unref();
    timer = setInterval(tick, delay);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopAuthRowsPruneScheduler };
};

export const stopAuthRowsPruneScheduler = (): void => {
    if (firstPass) {
        clearTimeout(firstPass);
        firstPass = null;
    }
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isAuthRowsPruneSchedulerRunning = (): boolean => timer !== null;
