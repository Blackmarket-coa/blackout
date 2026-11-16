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
 * The pool drops an idle client that failed. A held client whose 'error' has
 * fired is marked unusable by pg (client._queryable = false), so even a plain
 * release() destroys it rather than pooling it. A server FATAL that reaches a
 * query in flight is not an 'error' event yet: pg hands it to that query and
 * marks the client unusable only when the socket closes, a moment later, and a
 * plain release() in between pools the dead client for the next connect(). So
 * the store gives a client back with the error its work failed with
 * (db/pooledClient.ts), and pg-pool destroys it.
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

/**
 * TCP keepalive on the shared pool's connections (node-postgres `keepAlive`,
 * applied to each socket with setKeepAlive): probing starts once a connection
 * has carried nothing for this long, whether it sits in the pool or waits for
 * the answer to a statement the server has acknowledged. On Linux, Node 22's
 * libuv (1.51.0 here) also sets the probes 1 s apart and gives up after 10, so
 * a connection whose server's host has gone silent fails about this long and
 * 10 s more after its last traffic (KNOWN_LIMITATIONS.md, "Dropped Postgres
 * connections", has the measured figure). Not found this way: a server
 * process that stops answering on a host that stays up (that host's kernel
 * answers the probes), and a statement sent into the silence, which TCP
 * retransmission governs. BLACKOUT_PG_KEEPALIVE_DELAY_MS overrides it.
 */
export const DEFAULT_PG_KEEPALIVE_DELAY_MS = 10_000;

/**
 * How long a caller of the shared pool waits for a connection
 * (`connectionTimeoutMillis`). pg-pool (3.13.0) applies it to two waits: a new
 * connection being made (TCP and the start-up exchange), and a caller waiting
 * for one to come free while the pool has all of its connections out (ten,
 * pg-pool's default). Either way pool.connect() rejects when it runs out
 * ("timeout exceeded when trying to connect"). Without it a connection to a
 * host that answers nothing waits on the kernel's SYN retries (about two
 * minutes at Linux's defaults), and a waiting caller waits for good.
 * BLACKOUT_PG_CONNECT_TIMEOUT_MS overrides it.
 */
export const DEFAULT_PG_CONNECT_TIMEOUT_MS = 10_000;

/** `name` as a whole number of milliseconds above zero, or `fallback` (logged) for anything else. */
const millisecondsFromEnv = (name: string, fallback: number): number => {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (Number.isInteger(value) && value > 0) return value;
    log.warn('pg_pool_setting_ignored', { setting: name, usedMs: fallback });
    return fallback;
};

/** What the shared pool is created with, beside the connection string. */
export function sharedPoolOptions(): {
    keepAlive: true;
    keepAliveInitialDelayMillis: number;
    connectionTimeoutMillis: number;
} {
    return {
        keepAlive: true,
        keepAliveInitialDelayMillis: millisecondsFromEnv(
            'BLACKOUT_PG_KEEPALIVE_DELAY_MS',
            DEFAULT_PG_KEEPALIVE_DELAY_MS
        ),
        connectionTimeoutMillis: millisecondsFromEnv(
            'BLACKOUT_PG_CONNECT_TIMEOUT_MS',
            DEFAULT_PG_CONNECT_TIMEOUT_MS
        ),
    };
}

/** Create (once) and return the shared pg pool. Throws if DATABASE_URL is unset. */
export async function getSharedPgPool(): Promise<PgPool> {
    if (cachedPool) return cachedPool;
    const url = readDatabaseUrl();
    if (!url) {
        throw new Error('DATABASE_URL is required when BLACKOUT_DB_MODE=postgres.');
    }
    const { default: pg } = (await import('pg')) as {
        default: {
            Pool: new (
                cfg: { connectionString: string } & ReturnType<typeof sharedPoolOptions>
            ) => PgPool & PgPoolEvents;
        };
    };
    const pool = new pg.Pool({ connectionString: url, ...sharedPoolOptions() });
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
