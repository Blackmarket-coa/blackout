// Runtime Postgres connection config + a lazily-created shared pool, reused by
// the PostgresBackedDb store and the migrate-on-start step. Mirrors the shape of
// config/redis.ts. Only relevant when BLACKOUT_DB_MODE=postgres.

import type { PgPool } from '../db/migrate';
import { log } from '../telemetry/logger';
import { dbPoolClientErrorsTotal } from '../telemetry/metrics';

let cachedPool: PgPool | null = null;

/** The EventEmitter side of a pg pool client. */
export interface PgPoolClientEvents {
    on(event: 'error', listener: (err: Error) => void): unknown;
    removeListener(event: 'error', listener: (err: Error) => void): unknown;
}

/** The EventEmitter side of a pg (pg-pool) Pool. */
export interface PgPoolEvents {
    on(event: 'error', listener: (err: Error, client?: PgPoolClientEvents) => void): unknown;
    on(event: 'acquire', listener: (client: PgPoolClientEvents) => void): unknown;
    on(
        event: 'release',
        listener: (err: Error | undefined, client: PgPoolClientEvents) => void
    ): unknown;
}

const reportClientError = (state: 'idle' | 'held', err: Error): void => {
    dbPoolClientErrorsTotal.inc({ state });
    const code = (err as { code?: unknown }).code;
    // The message and code only: the error's `client` property carries the
    // connection parameters.
    log.warn('pg_pool_client_error', {
        state,
        ...(typeof code === 'string' ? { code } : {}),
        error: err.message,
    });
};

/**
 * Keep a pooled connection's failure (its backend terminated by a Postgres
 * restart, a failover or an idle-session timeout; a network reset) from ending
 * the process. A pg client is an EventEmitter, and an 'error' with no listener
 * throws:
 *   - an idle client's error is re-emitted on the pool, which has no listener
 *     of its own, so the pool gets one here;
 *   - a client checked out with connect() has none either (pg-pool takes its
 *     own off while the client is out), so each gets one from checkout until
 *     release.
 * The pool drops an idle client that failed. A held client that failed is
 * marked unusable by pg (client._queryable = false), so release() destroys it
 * rather than pooling it; the holder's next query on it rejects. Either way the
 * next connect() opens a fresh connection.
 */
export function handlePoolClientErrors(pool: PgPoolEvents): void {
    pool.on('error', (err) => reportClientError('idle', err));
    const held = new WeakMap<PgPoolClientEvents, (err: Error) => void>();
    pool.on('acquire', (client) => {
        // pg reports one dropped connection twice (the server's message, then
        // the socket closing); count it once.
        let reported = false;
        const listener = (err: Error): void => {
            if (reported) return;
            reported = true;
            reportClientError('held', err);
        };
        held.set(client, listener);
        client.on('error', listener);
    });
    pool.on('release', (_err, client) => {
        const listener = held.get(client);
        if (!listener) return;
        held.delete(client);
        client.removeListener('error', listener);
    });
}

export function readDatabaseUrl(): string | null {
    const url = process.env.DATABASE_URL?.trim();
    return url && url.length > 0 ? url : null;
}

/** Create (once) and return the shared pg pool. Throws if DATABASE_URL is unset. */
export async function getSharedPgPool(): Promise<PgPool> {
    if (cachedPool) return cachedPool;
    const url = readDatabaseUrl();
    if (!url) {
        throw new Error('DATABASE_URL is required when BLACKOUT_DB_MODE=postgres.');
    }
    const { default: pg } = (await import('pg')) as {
        default: { Pool: new (cfg: { connectionString: string }) => PgPool & PgPoolEvents };
    };
    const pool = new pg.Pool({ connectionString: url });
    handlePoolClientErrors(pool);
    cachedPool = pool;
    return pool;
}

export function getExistingPgPool(): PgPool | null {
    return cachedPool;
}

/** For tests / shutdown: drop the cached pool so a fresh one is created next time. */
export function clearSharedPgPool(): void {
    cachedPool = null;
}

/**
 * For tests: make `pool` the shared pool, as if getSharedPgPool had created
 * it, so a boot runs its real code against an in-process database.
 */
export function setSharedPgPoolForTests(pool: PgPool): void {
    cachedPool = pool;
}
