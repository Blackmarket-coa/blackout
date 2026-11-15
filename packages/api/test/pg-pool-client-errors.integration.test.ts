// A failed pooled Postgres connection must not end the process.
//
// pg clients are EventEmitters, and an 'error' nobody listens for throws. The
// shared pool (config/postgres.ts) is a real pg Pool here; only its
// connections are stand-ins (pg-pool builds them from `pool.Client`), so no
// database is needed. A stand-in fails the way pg's client does: it marks
// itself unqueryable, then emits 'error' (pg's Client._handleErrorEvent); or,
// for a server FATAL that arrives while a query is in flight, it rejects that
// query and stays queryable until its socket closes (Client._handleErrorMessage,
// then the 'end' handler). A query sent in between waits: no ReadyForQuery
// follows a FATAL, so pg queues it and fails it when the socket closes, by
// which time the client is marked unusable. When the socket closes, pg emits
// 'error' only if nobody has ended the client (the 'end' handler checks
// client._ending), and pg-pool ends every client it discards; the stand-ins do
// the same. The same drops against a real server are in
// pg-pool-client-errors-postgres.integration.test.ts.
//
// One thing here is not a stand-in's answer. The leader lock's connection
// sends one statement about the server's idle-session timeout, and the server
// decides what to do; that statement is also run on PGlite, which is
// PostgreSQL built to run inside this process (the tests named "PostgreSQL
// (PGlite)").
import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const { clearSharedPgPool, getSharedPgPool } = await import('../src/config/postgres');
const { dbPoolClientErrorsTotal } = await import('../src/telemetry/metrics');
const { PgNotifyTransport } = await import('../src/db/pgNotify');
const { forgetIdleSessionFailuresForTests, raiseIdleSessionTimeoutTo, restoreIdleSessionTimeout } =
    await import('../src/db/pooledClient');
const { PGlite } = await import('@electric-sql/pglite');
const { WriteBehindQueue } = await import('../src/db/writeBehindQueue');
const { PostgresBackedDb, REHYDRATE_RETRY_MS } = await import('../src/db/store');
const {
    acquireBackgroundLeaderLock,
    isBackgroundLeader,
    releaseBackgroundLeader,
    watchBackgroundLeadership,
} = await import('../src/services/backgroundLeader');
const { MIGRATIONS_DIR, migrateDown, migrateUp, status, verifyMigrationChecksums } = await import(
    '../src/db/migrate'
);

const PASSWORD = randomBytes(12).toString('hex');
const DATABASE_URL = `postgres://pool_test_user:${PASSWORD}@pool-test-host.invalid:5432/pool_test_db`;

/** A pg Client as pg-pool drives one, with no socket behind it. */
class FakeConnection extends EventEmitter {
    static made: FakeConnection[] = [];
    /** Statements that reached the server, by connection. */
    static executed: Array<{ connection: number; sql: string; params?: unknown[] }> = [];
    /**
     * The server's answer to a statement, where a test needs another than the
     * default: rows, or an error the statement is refused with while the
     * connection stays up.
     */
    static respond:
        | ((sql: string, params?: unknown[]) => { rows: unknown[] } | Error | undefined)
        | null = null;
    _queryable = true;
    _ending = false;
    ended = false;
    /** The server ended this backend; the socket has not closed yet. */
    private dead = false;
    private fatalOnNextQuery: Error | null = null;
    /** Only a query whose text matches gets the FATAL (terminateUnderQuery). */
    private fatalWhen: RegExp | null = null;
    private socketClosesAfterMs = 30;
    /** Queries sent after the FATAL, failed when the socket closes. */
    private queued: Array<(err: Error) => void> = [];
    readonly connectionParameters: Record<string, unknown>;

    constructor(options: { connectionString?: string }) {
        super();
        const url = new URL(options.connectionString ?? 'postgres://unset');
        this.connectionParameters = {
            user: url.username,
            host: url.hostname,
            database: url.pathname.slice(1),
        };
        FakeConnection.made.push(this);
    }

    connect(callback: (err?: Error) => void): void {
        setImmediate(() => callback());
    }

    async query(sql = '', params?: unknown[]): Promise<{ rows: unknown[] }> {
        if (!this._queryable) {
            throw new Error('Client has encountered a connection error and is not queryable');
        }
        if (this.dead) {
            return new Promise((_resolve, reject) => this.queued.push(reject));
        }
        const fatal = this.fatalWhen && !this.fatalWhen.test(sql) ? null : this.fatalOnNextQuery;
        if (fatal) {
            // The server's FATAL goes to the query in flight; pg leaves the
            // client queryable until the socket closes, a moment later, and
            // emits 'error' then only if nobody has ended the client.
            this.fatalOnNextQuery = null;
            this.fatalWhen = null;
            this.dead = true;
            setTimeout(() => this.socketClosed(), this.socketClosesAfterMs);
            throw fatal;
        }
        FakeConnection.executed.push({
            connection: FakeConnection.made.indexOf(this),
            sql,
            params,
        });
        const answer = FakeConnection.respond?.(sql, params);
        if (answer instanceof Error) throw answer;
        if (answer) return answer;
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
        // A server with no idle-session timeout set: it raises nothing.
        if (sql.includes('pg_settings')) return { rows: [{ setting: '0', raised_to: null }] };
        // One store table, users, so PostgresBackedDb has a table to load and read back.
        if (sql.includes('information_schema.columns') && params?.[0] === 'users') {
            return {
                rows: [
                    { column_name: 'id', data_type: 'text', udt_name: 'text', is_nullable: 'NO' },
                    {
                        column_name: 'username',
                        data_type: 'text',
                        udt_name: 'text',
                        is_nullable: 'NO',
                    },
                ],
            };
        }
        return { rows: [] };
    }

    /** The server ends this backend while the next query is in flight. */
    terminateUnderNextQuery(err: Error, socketClosesAfterMs = 30): void {
        this.fatalOnNextQuery = err;
        this.socketClosesAfterMs = socketClosesAfterMs;
    }

    /** The server ends this backend while the next query matching `sql` is in flight. */
    terminateUnderQuery(sql: RegExp, err: Error, socketClosesAfterMs = 30): void {
        this.terminateUnderNextQuery(err, socketClosesAfterMs);
        this.fatalWhen = sql;
    }

    end(callback?: () => void): void {
        this._ending = true;
        this.ended = true;
        if (callback) setImmediate(callback);
    }

    /** What pg's client does when its connection dies. */
    fail(err: Error): void {
        this._queryable = false;
        this.emit('error', err);
    }

    /**
     * The socket closes: pg fails every query still waiting, then reports the
     * drop (marking the client unusable) only if nobody has ended the client.
     */
    socketClosed(): void {
        const err = new Error(
            this._ending ? 'Connection terminated' : 'Connection terminated unexpectedly'
        );
        for (const reject of this.queued.splice(0)) reject(err);
        if (!this._ending) this.fail(new Error('Connection terminated unexpectedly'));
    }
}

interface PooledClient {
    query(sql: string): Promise<unknown>;
    release(err?: Error): void;
}
interface SharedPool {
    connect(): Promise<PooledClient>;
    end(): Promise<void>;
    totalCount: number;
    Client: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (condition: () => boolean, label: string, ms = 5_000) => {
    const deadline = Date.now() + ms;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
        await sleep(20);
    }
};

/**
 * End a pool in teardown without waiting forever. pool.end() waits for every
 * client still checked out, so a test that fails before it gives one back
 * would hang the teardown and cancel every test after it.
 */
const endPool = async (pool: { end(): Promise<void> }): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([pool.end(), new Promise((r) => (timer = setTimeout(r, 3_000)))]);
    clearTimeout(timer);
};

const terminated = (): Error =>
    Object.assign(new Error('terminating connection due to administrator command'), {
        code: '57P01',
        severity: 'FATAL',
    });

const sharedPoolOfFakes = async (): Promise<SharedPool> => {
    process.env.DATABASE_URL = DATABASE_URL;
    clearSharedPgPool();
    FakeConnection.made = [];
    FakeConnection.executed = [];
    FakeConnection.respond = null;
    const pool = (await getSharedPgPool()) as unknown as SharedPool;
    pool.Client = FakeConnection;
    return pool;
};

const counted = (state: string): number => {
    const line = dbPoolClientErrorsTotal
        .expose()
        .split('\n')
        .find((l) => l.startsWith(`db_pool_client_errors_total{state="${state}"}`));
    return line ? Number(line.split(' ').pop()) : 0;
};

/** console.warn and console.error lines until the test ends. */
const captureLogs = (t: { after(fn: () => void): void }): string[] => {
    const lines: string[] = [];
    const { warn, error } = console;
    console.warn = (line: unknown) => lines.push(String(line));
    console.error = (line: unknown) => lines.push(String(line));
    t.after(() => {
        console.warn = warn;
        console.error = error;
    });
    return lines;
};
const logged = (lines: string[], msg: string): Array<Record<string, unknown>> =>
    lines
        .filter((l) => l.startsWith('{'))
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .filter((e) => e.msg === msg);

/** Unhandled rejections until the test ends; Node ends the process on one. */
const captureUnhandledRejections = (t: { after(fn: () => void): void }): unknown[] => {
    const seen: unknown[] = [];
    const onRejection = (reason: unknown) => seen.push(reason);
    process.on('unhandledRejection', onRejection);
    t.after(() => {
        process.off('unhandledRejection', onRejection);
    });
    return seen;
};

/** Run `fn` with console.warn captured; returns the warn lines. */
const warnings = (fn: () => void): string[] => {
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (line: unknown) => lines.push(String(line));
    try {
        fn();
    } finally {
        console.warn = original;
    }
    return lines;
};

const assertSecretFree = (line: string): void => {
    for (const leak of [
        PASSWORD,
        'pool_test_user',
        'pool-test-host',
        'pool_test_db',
        'postgres://',
    ]) {
        assert.ok(!line.includes(leak), `log line leaks ${leak}: ${line}`);
    }
};

let openPool: SharedPool | null = null;
afterEach(async () => {
    if (openPool) await endPool(openPool);
    openPool = null;
    clearSharedPgPool();
});

test('an idle pooled connection that fails is dropped, logged without connection details and counted; the next checkout opens a new one', async () => {
    const pool = (openPool = await sharedPoolOfFakes());
    const first = await pool.connect();
    first.release();
    const dead = FakeConnection.made[0];
    const before = counted('idle');

    const lines = warnings(() => {
        assert.doesNotThrow(() => dead.fail(terminated()));
        // The pool has ended it, so pg does not report the socket closing.
        assert.doesNotThrow(() => dead.socketClosed());
    });

    assert.equal(counted('idle'), before + 1);
    assert.equal(lines.length, 1, lines.join('\n'));
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.msg, 'pg_pool_client_error');
    assert.equal(entry.level, 'warn');
    assert.equal(entry.state, 'idle');
    assert.equal(entry.code, '57P01');
    assert.equal(entry.error, 'terminating connection due to administrator command');
    assertSecretFree(lines[0]);

    assert.equal(dead.ended, true, 'the pool destroyed the dead connection');
    const next = await pool.connect();
    assert.equal(FakeConnection.made.length, 2, 'a new connection');
    await next.query('SELECT 1');
    next.release();
});

test('a checked-out connection that fails does not end the process, and release() destroys it instead of pooling it', async () => {
    const pool = (openPool = await sharedPoolOfFakes());
    const held = await pool.connect();
    const dead = FakeConnection.made[0];
    const before = counted('held');

    // Held with no query in flight, as the background-leader lock is. Nobody
    // has ended it, so pg reports the drop again when the socket closes.
    const lines = warnings(() => {
        assert.doesNotThrow(() => dead.fail(terminated()));
        assert.doesNotThrow(() => dead.socketClosed());
    });

    assert.equal(counted('held'), before + 1, 'one drop, counted once');
    assert.equal(lines.length, 1, lines.join('\n'));
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.msg, 'pg_pool_client_error');
    assert.equal(entry.state, 'held');
    assert.equal(entry.code, '57P01');
    assertSecretFree(lines[0]);

    await assert.rejects(held.query('SELECT 1'), /not queryable/);
    // Even a plain release() destroys it: pg has marked it unqueryable.
    held.release();
    assert.equal(dead.ended, true, 'destroyed, not returned to the pool');
    assert.equal(pool.totalCount, 0);
    const next = await pool.connect();
    assert.equal(FakeConnection.made.length, 2, 'the next checkout is a new connection');
    next.release();
});

test('a checked-out connection carries the listener only while it is held', async () => {
    const pool = (openPool = await sharedPoolOfFakes());
    const client = await pool.connect();
    const conn = FakeConnection.made[0];
    // pg-pool takes its own listener off while the client is out.
    assert.equal(conn.listenerCount('error'), 1, 'held: the shared pool listens');
    client.release();
    assert.equal(conn.listenerCount('error'), 1, 'idle: only pg-pool listens');
    const again = await pool.connect();
    assert.equal(FakeConnection.made.length, 1, 'the healthy connection was reused');
    assert.equal(conn.listenerCount('error'), 1, 'reuse does not stack listeners');
    again.release();
    // Released, its failure is the pool's again (logged as idle, not held).
    const heldBefore = counted('held');
    const idleBefore = counted('idle');
    warnings(() => assert.doesNotThrow(() => conn.fail(terminated())));
    assert.equal(counted('held'), heldBefore);
    assert.equal(counted('idle'), idleBefore + 1);
});

// The LISTEN connection, which a process holds idle on purpose, turns the
// server's idle_session_timeout off for its own session, and puts it back
// before it returns to the pool. The background-leader lock's connection sends
// a lock check every 10 s: with one statement it has the server raise a
// timeout too short for that to 30 s, and it puts that back.
const EXEMPT = 'SET idle_session_timeout = 0';
const RESTORE = 'RESET idle_session_timeout';
/** The lock connection's statement: only it calls set_config. */
const isRaise = (sql: string): boolean => sql.includes("set_config('idle_session_timeout'");
/** What the lock connection is sent after that statement fails, to learn whether it is still there. */
const STILL_THERE = 'SELECT 1';
const LISTEN = 'LISTEN blackout_store_change';
const UNLISTEN = 'UNLISTEN blackout_store_change';

/** What a server older than PostgreSQL 14, which has no such setting, answers. */
const unrecognized = (): Error =>
    Object.assign(new Error('unrecognized configuration parameter "idle_session_timeout"'), {
        code: '42704',
        severity: 'ERROR',
    });

/** console.info lines until the test ends. */
const captureInfo = (t: { after(fn: () => void): void }): string[] => {
    const lines: string[] = [];
    const { info } = console;
    console.info = (line: unknown) => lines.push(String(line));
    t.after(() => {
        console.info = info;
    });
    return lines;
};

/** The LISTEN connection PgNotifyTransport holds. */
class FakeListenClient extends EventEmitter {
    queries: string[] = [];
    released: Array<'pooled' | Error> = [];
    /** pg-pool ends a client given back with an error (pg's client._ending). */
    ending = false;
    async query(sql: string): Promise<unknown> {
        this.queries.push(sql);
        return {};
    }
    release(err?: Error): void {
        this.released.push(err ?? 'pooled');
        if (err) this.ending = true;
    }
    /** The socket closes: pg reports it only if nobody has ended the client. */
    socketClosed(): void {
        if (!this.ending) this.emit('error', new Error('Connection terminated unexpectedly'));
    }
}

test('a dropped LISTEN connection is destroyed and replaced once, not leaked and doubled', async () => {
    const clients: FakeListenClient[] = [];
    const transport = new PgNotifyTransport({
        connect: async () => {
            const c = new FakeListenClient();
            clients.push(c);
            return c;
        },
    });
    let reconnects = 0;
    transport.onReconnect(() => (reconnects += 1));
    await transport.subscribe(() => undefined);
    assert.equal(clients.length, 1);

    // The server's FATAL reaches the idle LISTEN client as an 'error'. pg would
    // report the socket closing too, but only if nobody had ended the client,
    // and the handler gives it back with its error, which ends it.
    const lines = warnings(() => {
        clients[0].emit('error', terminated());
        clients[0].socketClosed();
    });
    assert.equal(lines.filter((l) => l.includes('pg_notify_listen_error')).length, 1);
    assert.equal(clients[0].released.length, 1, 'released once');
    assert.ok(clients[0].released[0] instanceof Error, 'released with its error: destroyed');

    // The transport reconnects after 2 s; every reconnect it scheduled is due
    // by the time the first has happened.
    const deadline = Date.now() + 5_000;
    while (clients.length < 2 && Date.now() < deadline) await sleep(50);
    await sleep(300);
    assert.equal(clients.length, 2, 'one new LISTEN connection, not one per error event');
    assert.deepEqual(clients[1].queries, [EXEMPT, LISTEN]);
    assert.equal(reconnects, 1);

    await transport.close();
    assert.deepEqual(clients[1].released, ['pooled']);
    assert.equal(clients[0].released.length, 1, 'the dead client is not released twice');
});

test('a reconnect whose LISTEN fails on a dropped connection is retried once, not twice', async () => {
    const clients: FakeListenClient[] = [];
    const transport = new PgNotifyTransport({
        connect: async () => {
            const c = new FakeListenClient();
            if (clients.length === 1) {
                // A socket reset under the first reconnect's LISTEN: pg emits
                // 'error' on the client, then rejects the query.
                c.query = async (sql: string) => {
                    c.queries.push(sql);
                    if (sql !== LISTEN) return {};
                    c.emit('error', terminated());
                    throw terminated();
                };
            }
            clients.push(c);
            return c;
        },
    });
    await transport.subscribe(() => undefined);
    warnings(() => clients[0].emit('error', terminated()));

    const deadline = Date.now() + 8_000;
    while (clients.length < 3 && Date.now() < deadline) await sleep(50);
    await sleep(300);
    assert.equal(clients.length, 3, 'one retry after the failed reconnect');
    assert.equal(clients[1].released.length, 1);
    assert.ok(clients[1].released[0] instanceof Error);
    await transport.close();
});

test('a reconnect whose LISTEN the server ends gives the dead client back once, then retries once', async (t) => {
    captureLogs(t);
    const clients: FakeListenClient[] = [];
    const transport = new PgNotifyTransport({
        connect: async () => {
            const c = new FakeListenClient();
            if (clients.length === 1) {
                // The backend is terminated under the first reconnect's LISTEN:
                // pg rejects LISTEN with the server's FATAL, and when the socket
                // closes it emits 'error' only if nobody has ended the client.
                // The catch around LISTEN gives the client back with its error,
                // which ends it, so no 'error' follows.
                c.query = async (sql: string) => {
                    c.queries.push(sql);
                    if (sql !== LISTEN) return {};
                    setTimeout(() => c.socketClosed(), 30);
                    throw terminated();
                };
            }
            clients.push(c);
            return c;
        },
    });
    let reconnects = 0;
    transport.onReconnect(() => (reconnects += 1));
    await transport.subscribe(() => undefined);
    clients[0].emit('error', terminated());

    const deadline = Date.now() + 8_000;
    while (clients.length < 3 && Date.now() < deadline) await sleep(50);
    await sleep(300);
    assert.equal(clients.length, 3, 'one retry after the failed reconnect');
    assert.equal(clients[1].released.length, 1, 'the dead client is given back, once');
    assert.ok(clients[1].released[0] instanceof Error, 'with its error: the pool destroys it');
    assert.equal(reconnects, 1);
    await transport.close();
    assert.deepEqual(clients[2].released, ['pooled']);
});

test('a reconnect whose LISTEN fails with no connection error after it still gives that client back', async (t) => {
    captureLogs(t);
    const clients: FakeListenClient[] = [];
    const transport = new PgNotifyTransport({
        connect: async () => {
            const c = new FakeListenClient();
            if (clients.length === 1) {
                // LISTEN is refused but the connection stays up (a statement
                // timeout, say): no 'error' event follows to give it back.
                c.query = async (sql: string) => {
                    c.queries.push(sql);
                    if (sql !== LISTEN) return {};
                    throw Object.assign(new Error('canceling statement due to statement timeout'), {
                        code: '57014',
                    });
                };
            }
            clients.push(c);
            return c;
        },
    });
    await transport.subscribe(() => undefined);
    clients[0].emit('error', terminated());

    const deadline = Date.now() + 8_000;
    while (clients.length < 3 && Date.now() < deadline) await sleep(50);
    await sleep(300);
    assert.equal(clients.length, 3, 'one retry after the failed reconnect');
    assert.equal(clients[1].released.length, 1, 'the refused client is given back, once');
    assert.ok(clients[1].released[0] instanceof Error);
    await transport.close();
});

test('the LISTEN connection turns the idle-session timeout off for itself before LISTEN, on every connection it opens, and puts it back before returning to the pool', async (t) => {
    captureLogs(t);
    const clients: FakeListenClient[] = [];
    const transport = new PgNotifyTransport({
        connect: async () => {
            const c = new FakeListenClient();
            clients.push(c);
            return c;
        },
    });
    let reconnects = 0;
    transport.onReconnect(() => (reconnects += 1));
    await transport.subscribe(() => undefined);
    assert.deepEqual(clients[0].queries, [EXEMPT, LISTEN]);

    clients[0].emit('error', terminated());
    await waitFor(() => reconnects === 1, 'the reconnect');
    assert.deepEqual(clients[1].queries, [EXEMPT, LISTEN], 'the replacement too');
    assert.deepEqual(clients[0].queries, [EXEMPT, LISTEN], 'nothing more on the dropped one');

    await transport.close();
    assert.deepEqual(clients[1].queries, [EXEMPT, LISTEN, UNLISTEN, RESTORE]);
    assert.deepEqual(clients[1].released, ['pooled'], 'pooled once the timeout is back');
});

test('a server that refuses the idle-session statement still gets its LISTEN connection, and the refusal is logged once', async (t) => {
    captureLogs(t);
    const info = captureInfo(t);
    forgetIdleSessionFailuresForTests();
    const clients: FakeListenClient[] = [];
    const transport = new PgNotifyTransport({
        connect: async () => {
            const c = new FakeListenClient();
            c.query = async (sql: string) => {
                c.queries.push(sql);
                if (sql === EXEMPT) throw unrecognized();
                return {};
            };
            clients.push(c);
            return c;
        },
    });
    let reconnects = 0;
    transport.onReconnect(() => (reconnects += 1));
    await transport.subscribe(() => undefined);
    assert.deepEqual(clients[0].queries, [EXEMPT, LISTEN], 'LISTEN is still sent');
    assert.deepEqual(clients[0].released, [], 'the connection is kept');

    clients[0].emit('error', terminated());
    await waitFor(() => reconnects === 1, 'the reconnect');
    assert.deepEqual(clients[1].queries, [EXEMPT, LISTEN], 'refused again on the replacement');
    assert.deepEqual(clients[1].released, []);

    const refusals = logged(info, 'pg_idle_session_timeout_not_exempted');
    assert.equal(refusals.length, 1, 'two refusals, one line');
    assert.equal(refusals[0].level, 'info');
    assert.equal(refusals[0].code, '42704');
    assert.match(String(refusals[0].error), /unrecognized configuration parameter/);

    await transport.close();
    assert.deepEqual(
        clients[1].queries,
        [EXEMPT, LISTEN, UNLISTEN],
        'nothing to put back where the statement never took effect'
    );
    assert.deepEqual(clients[1].released, ['pooled']);
});

test('a LISTEN connection whose idle-session timeout cannot be put back is destroyed, not pooled', async (t) => {
    captureLogs(t);
    const c = new FakeListenClient();
    c.query = async (sql: string) => {
        c.queries.push(sql);
        if (sql === RESTORE) {
            throw Object.assign(new Error('canceling statement due to statement timeout'), {
                code: '57014',
            });
        }
        return {};
    };
    const transport = new PgNotifyTransport({ connect: async () => c });
    await transport.subscribe(() => undefined);
    await transport.close();
    assert.deepEqual(c.queries, [EXEMPT, LISTEN, UNLISTEN, RESTORE]);
    assert.equal(c.released.length, 1, 'given back once');
    assert.ok(c.released[0] instanceof Error, 'with the error: the pool destroys it');
});

test("a LISTEN connection dropped under close()'s UNLISTEN is given back once, and close() resolves", async (t) => {
    const lines = captureLogs(t);
    const c = new FakeListenClient();
    // A Postgres restart during a drain. The socket drops under UNLISTEN: pg
    // emits 'error' on the client, then rejects that statement and every
    // later one.
    c.query = async (sql: string) => {
        c.queries.push(sql);
        if (sql === UNLISTEN) {
            c.emit('error', terminated());
            throw terminated();
        }
        if (c.ending) {
            throw new Error('Client has encountered a connection error and is not queryable');
        }
        return {};
    };
    // pg-pool throws when a client is given back a second time.
    const release = c.release.bind(c);
    c.release = (err?: Error) => {
        release(err);
        if (c.released.length > 1) {
            throw new Error(
                'Release called on client which has already been released to the pool.'
            );
        }
    };
    let connects = 0;
    const transport = new PgNotifyTransport({
        connect: async () => {
            connects += 1;
            return c;
        },
    });
    await transport.subscribe(() => undefined);

    // The 'error' listener gives the connection back with its error. close()
    // must not give it back again.
    await transport.close();
    assert.equal(c.released.length, 1, 'given back once');
    assert.ok(c.released[0] instanceof Error, 'with its error: the pool destroys it');
    assert.equal(logged(lines, 'pg_notify_listen_error').length, 1);
    await sleep(50);
    assert.equal(connects, 1, 'a closed transport opens no replacement');
});

test('a LISTEN connection dropped while the idle-session statement is out fails as one dropped under LISTEN does: given back once, replaced once', async (t) => {
    captureLogs(t);
    const clients: FakeListenClient[] = [];
    const transport = new PgNotifyTransport({
        connect: async () => {
            const c = new FakeListenClient();
            if (clients.length === 0) {
                // A socket reset under the idle-session statement: pg emits
                // 'error' on the client, then rejects that statement and every
                // later one.
                c.query = async (sql: string) => {
                    c.queries.push(sql);
                    if (sql === EXEMPT) c.emit('error', terminated());
                    throw sql === EXEMPT
                        ? terminated()
                        : new Error(
                              'Client has encountered a connection error and is not queryable'
                          );
                };
            }
            clients.push(c);
            return c;
        },
    });
    let reconnects = 0;
    transport.onReconnect(() => (reconnects += 1));
    // The failed idle-session statement is passed over; the LISTEN after it
    // fails, and that fails the open as it always did.
    await assert.rejects(
        transport.subscribe(() => undefined),
        /not queryable/
    );
    assert.equal(clients[0].released.length, 1, 'given back once');
    assert.ok(clients[0].released[0] instanceof Error, 'with its error: destroyed');

    await waitFor(() => reconnects === 1, 'the reconnect');
    await sleep(300);
    assert.equal(clients.length, 2, 'one replacement');
    assert.deepEqual(clients[1].queries, [EXEMPT, LISTEN]);
    await transport.close();
});

test('close() while the idle-session statement is out sends no LISTEN on the connection it gives back', async () => {
    const c = new FakeListenClient();
    let answerExempt: () => void = () => undefined;
    const exemptAnswered = new Promise<void>((r) => (answerExempt = r));
    // One statement at a time, answered in the order sent, as on a real connection.
    let last: Promise<unknown> = Promise.resolve();
    c.query = (sql: string) => {
        c.queries.push(sql);
        const answer = last
            .then(() => (sql === EXEMPT ? exemptAnswered : undefined))
            .then(() => ({}));
        last = answer;
        return answer;
    };
    const transport = new PgNotifyTransport({ connect: async () => c });
    const subscribed = transport.subscribe(() => undefined);
    await waitFor(() => c.queries.length === 1, 'the idle-session statement to be sent');
    const closed = transport.close();
    answerExempt();
    await Promise.all([subscribed, closed]);
    assert.deepEqual(c.queries, [EXEMPT, UNLISTEN, RESTORE], 'no LISTEN, and the timeout is back');
    assert.deepEqual(c.released, ['pooled'], 'given back once');
});

test('close() while a reconnect is under way reports no reconnect', async (t) => {
    captureLogs(t);
    const info = captureInfo(t);
    const clients: FakeListenClient[] = [];
    let answerExempt: () => void = () => undefined;
    const exemptAnswered = new Promise<void>((r) => (answerExempt = r));
    const transport = new PgNotifyTransport({
        connect: async () => {
            const c = new FakeListenClient();
            if (clients.length === 1) {
                // The reconnect's connection: one statement at a time, answered
                // in the order sent, the idle-session statement when the test
                // says and each later one a turn of the event loop after it.
                let last: Promise<unknown> = Promise.resolve();
                c.query = (sql: string) => {
                    c.queries.push(sql);
                    const answer = last
                        .then(() =>
                            sql === EXEMPT
                                ? exemptAnswered
                                : new Promise<void>((r) => setImmediate(r))
                        )
                        .then(() => ({}));
                    last = answer;
                    return answer;
                };
            }
            clients.push(c);
            return c;
        },
    });
    let reconnects = 0;
    transport.onReconnect(() => (reconnects += 1));
    await transport.subscribe(() => undefined);
    clients[0].emit('error', terminated());
    await waitFor(
        () => clients[1]?.queries.length === 1,
        'the reconnect to send its first statement'
    );

    // The transport is closed before the reconnect has listened. The
    // reconnect's connection is still the transport's while close() waits for
    // its own statements on it.
    const closed = transport.close();
    answerExempt();
    await closed;
    await sleep(50);
    assert.deepEqual(clients[1].queries, [EXEMPT, UNLISTEN, RESTORE], 'no LISTEN was sent');
    assert.deepEqual(clients[1].released, ['pooled'], 'given back once');
    assert.equal(reconnects, 0, 'no re-hydrate is asked for');
    assert.deepEqual(
        logged(info, 'pg_notify_listen_reconnected'),
        [],
        'and no reconnect is logged'
    );
});

const probePlan = {
    descriptor: {
        mapName: 'probe',
        tableName: 'probe_wb',
        keyOf: (r: Record<string, unknown>) => String(r.id),
        conflictColumns: ['id'],
    },
    columns: [
        { name: 'id', dataType: 'text', udtName: 'text', nullable: false },
        { name: 'v', dataType: 'text', udtName: 'text', nullable: true },
    ],
    columnNames: new Set(['id', 'v']),
};

test('a write whose backend the server ends under its query is retried on a new connection, not the dead one', async (t) => {
    const lines = captureLogs(t);
    const pool = (openPool = await sharedPoolOfFakes());
    // A healthy connection idle in the pool, as after any earlier write.
    (await pool.connect()).release();
    const first = FakeConnection.made[0];
    first.terminateUnderNextQuery(terminated());
    const queue = new WriteBehindQueue(pool as never, new Map([['probe', probePlan]]) as never);
    queue.enqueueUpsert('probe', { id: 'a', v: 'written' });
    await queue.drain();

    assert.deepEqual(logged(lines, 'db_write_behind_failed'), [], 'the write was not dropped');
    assert.equal(logged(lines, 'db_write_behind_retry').length, 1);
    assert.equal(first.ended, true, 'the dead connection was destroyed, not pooled');
    const writes = FakeConnection.executed.filter((e) => e.sql.startsWith('INSERT INTO probe_wb'));
    assert.deepEqual(
        writes.map((w) => w.connection),
        [1],
        'the retry wrote on a new connection'
    );
});

/**
 * A targeted op (one mutator call's statements) runs as one transaction on one
 * checkout. A FATAL under a statement inside it is followed by a ROLLBACK,
 * which pg queues until the socket closes, so by the time the client goes back
 * pg has marked it unusable; a FATAL under BEGIN or COMMIT is not, and only the
 * error given back with the client keeps the retry off it.
 */
for (const [step, sql] of [
    ['BEGIN', /^BEGIN/],
    ['COMMIT', /^COMMIT/],
] as const) {
    test(`a targeted write whose backend the server ends under its ${step} is retried on a new connection, not the dead one`, async (t) => {
        const lines = captureLogs(t);
        const pool = (openPool = await sharedPoolOfFakes());
        (await pool.connect()).release();
        const first = FakeConnection.made[0];
        first.terminateUnderQuery(sql, terminated());
        const queue = new WriteBehindQueue(pool as never, new Map([['probe', probePlan]]) as never);
        queue.enqueueTargeted({
            method: 'deleteProbe',
            statements: [
                {
                    map: 'probe',
                    sql: 'DELETE FROM probe_wb WHERE id = $1 RETURNING id',
                    params: ['a'],
                    required: false,
                },
            ],
            touched: new Map([['probe', new Map([['a', ['a']]])]]),
        });
        await queue.drain();

        assert.deepEqual(logged(lines, 'db_write_behind_failed'), [], 'the write was not dropped');
        assert.equal(logged(lines, 'db_write_behind_retry').length, 1);
        assert.equal(first.ended, true, 'the dead connection was destroyed, not pooled');
        const commits = FakeConnection.executed.filter((e) => e.sql === 'COMMIT');
        assert.deepEqual(
            commits.map((c) => c.connection),
            [1],
            'the retry committed on a new connection'
        );
    });
}

/** A pool for PostgresBackedDb that can refuse new connections; one table, users. */
const storePool = () => {
    const state = {
        refuse: false,
        users: [] as Array<Record<string, unknown>>,
        /** connect() calls, refused ones included. */
        connects: 0,
    };
    const client = {
        async query(sql: string, params?: unknown[]) {
            if (sql.includes('information_schema.columns')) {
                const users = [
                    { column_name: 'id', data_type: 'text', udt_name: 'text', is_nullable: 'NO' },
                    {
                        column_name: 'username',
                        data_type: 'text',
                        udt_name: 'text',
                        is_nullable: 'NO',
                    },
                ];
                return { rows: params?.[0] === 'users' ? users : [] };
            }
            if (sql.startsWith('SELECT * FROM users')) return { rows: state.users };
            return { rows: [] };
        },
        release() {},
    };
    const pool = {
        async connect() {
            state.connects += 1;
            if (state.refuse) {
                throw Object.assign(new Error('too many connections for role "app"'), {
                    code: '53300',
                });
            }
            return client;
        },
        async end() {},
    };
    return { pool, state };
};

type Payload = { src: string; m: string; op: 'u' | 'k' | 'r'; kv?: string[]; kvs?: string[][] };

/** A change transport whose peer changes and reconnects the test delivers. */
const stubTransport = () => {
    const stub = {
        peer: (_payload: Payload): void => undefined,
        reconnect: (): void => undefined,
        publish: (): void => undefined,
        async subscribe(handler: (payload: Payload) => void) {
            stub.peer = handler;
        },
        onReconnect(handler: () => void) {
            stub.reconnect = handler;
        },
        async close() {},
    };
    return stub;
};

test('a peer change or a re-hydrate that cannot get a connection does not end the process, and the re-hydrate is retried, one retry at a time', async (t) => {
    const rejections = captureUnhandledRejections(t);
    const lines = captureLogs(t);
    const { pool, state } = storePool();
    const transport = stubTransport();
    const store = new PostgresBackedDb();
    await store.init(pool as never, transport as never);
    t.after(() => store.shutdown());

    // A quiet replica holds only its LISTEN connection, so each of these needs a
    // new one, and Postgres refuses it (connection limit, starting up, network).
    state.refuse = true;
    transport.peer({ src: 'peer-replica', m: 'users', op: 'r' });
    // The listener reconnects twice during the outage (each reconnect asks for
    // a re-hydrate), and both re-hydrates fail.
    transport.reconnect();
    transport.reconnect();
    await sleep(100);
    assert.deepEqual(rejections, [], 'no unhandled rejection');
    const [peer] = logged(lines, 'pg_store_peer_refresh_failed');
    assert.equal(peer?.map, 'users');
    assert.match(String(peer?.error), /too many connections/);
    const failed = logged(lines, 'pg_store_rehydrate_failed');
    assert.equal(failed.length, 2);
    assert.equal(failed[0].retryInMs, REHYDRATE_RETRY_MS);
    const connectsBeforeRetry = state.connects;

    // Postgres takes connections again, and holds a user this mirror missed.
    state.refuse = false;
    state.users = [{ id: 'u-missed', username: 'missed' }];
    const deadline = Date.now() + REHYDRATE_RETRY_MS + 3_000;
    while (!store.getUserById('u-missed') && Date.now() < deadline) await sleep(50);
    assert.equal(store.getUserById('u-missed')?.username, 'missed', 'the retry re-hydrated');
    await sleep(300);
    assert.equal(state.connects, connectsBeforeRetry + 1, 'one retry for both failures');
    assert.equal(logged(lines, 'pg_store_rehydrate_failed').length, 2, 'no retry once it worked');
    assert.deepEqual(rejections, []);
});

test('shutdown() stops a pending re-hydrate retry', async (t) => {
    const lines = captureLogs(t);
    const { pool, state } = storePool();
    const transport = stubTransport();
    const store = new PostgresBackedDb();
    await store.init(pool as never, transport as never);

    state.refuse = true;
    transport.reconnect();
    await waitFor(
        () => logged(lines, 'pg_store_rehydrate_failed').length > 0,
        'the re-hydrate to fail'
    );
    await store.shutdown();
    const connectsAtShutdown = state.connects;

    // Postgres takes connections again; a retry still pending would now reload.
    state.refuse = false;
    state.users = [{ id: 'u-after-shutdown', username: 'after' }];
    await sleep(REHYDRATE_RETRY_MS + 1_000);
    assert.equal(state.connects, connectsAtShutdown, 'no connection after shutdown');
    assert.equal(store.getUserById('u-after-shutdown'), undefined, 'no re-hydrate after shutdown');
    assert.equal(logged(lines, 'pg_store_rehydrate_failed').length, 1);
});

test('a re-hydrate that succeeds cancels a retry still pending from an earlier failure', async (t) => {
    const lines = captureLogs(t);
    const { pool, state } = storePool();
    const transport = stubTransport();
    const store = new PostgresBackedDb();
    await store.init(pool as never, transport as never);
    t.after(() => store.shutdown());

    // The first reconnect's re-hydrate fails, which leaves a retry pending.
    state.refuse = true;
    transport.reconnect();
    await waitFor(
        () => logged(lines, 'pg_store_rehydrate_failed').length > 0,
        'the re-hydrate to fail'
    );
    // The next reconnect's re-hydrate succeeds before the retry falls due.
    state.refuse = false;
    state.users = [{ id: 'u-back', username: 'back' }];
    transport.reconnect();
    await waitFor(() => store.getUserById('u-back') !== undefined, 'the re-hydrate to succeed');
    const connectsAfterSuccess = state.connects;

    await sleep(REHYDRATE_RETRY_MS + 500);
    assert.equal(state.connects, connectsAfterSuccess, 'no second re-hydrate after the success');
    assert.equal(logged(lines, 'pg_store_rehydrate_failed').length, 1);
});

/**
 * The other checkouts that go through db/pooledClient.ts, as the write-behind
 * queue's do: the store's load at boot (and the check of its targeted
 * statements that ends it), a change notification and migrate.ts's four
 * functions here, and the store's checkouts after boot in the block after this
 * one. Of migrate.ts's four, migrateUp and verifyMigrationChecksums run in the
 * app at boot (db/runtimeStoreBoot.ts); migrateDown and status run only in the
 * migrate command-line tool, on a pool of its own. The app's other two
 * checkouts give their connection back by hand: the LISTEN connection
 * (PgNotifyTransport; the LISTEN tests above) and the leader-lock connection
 * (services/backgroundLeader.ts; the leader tests at the end of this file).
 * Each case starts with one healthy connection idle in the pool, as after any
 * earlier query, and the server ends that backend under the case's first
 * query (or the one it names); the socket has not closed yet when the next
 * checkout comes.
 */
const checkoutCases: Array<[string, (pool: SharedPool, lines: string[]) => Promise<void>]> = [
    [
        'the store loading at boot (PostgresBackedDb.init)',
        async (pool) => {
            const store = new PostgresBackedDb();
            await assert.rejects(
                store.init(pool as never, stubTransport() as never),
                /terminating/
            );
        },
    ],
    [
        "the store's boot check of its targeted statements (PostgresBackedDb.init, the PREPARE transaction)",
        async (pool) => {
            // The load succeeds; the server ends the backend under the BEGIN
            // of the transaction that PREPAREs each targeted statement.
            FakeConnection.made[0].terminateUnderQuery(/^BEGIN/, terminated(), 1_000);
            const store = new PostgresBackedDb();
            await assert.rejects(
                store.init(pool as never, stubTransport() as never),
                /terminating/
            );
            assert.ok(
                FakeConnection.executed.some(
                    (e) => e.connection === 0 && e.sql.startsWith('SELECT * FROM users')
                ),
                'the load ran on that connection first'
            );
        },
    ],
    [
        'a change notification (PgNotifyTransport.publish)',
        async (pool, lines) => {
            const transport = new PgNotifyTransport(pool as never);
            transport.publish({ src: 'this-replica', m: 'users', op: 'u', kv: ['u1'] });
            await waitFor(
                () => logged(lines, 'pg_notify_publish_failed').length > 0,
                'the publish to fail'
            );
            assert.match(String(logged(lines, 'pg_notify_publish_failed')[0].error), /terminating/);
        },
    ],
    [
        'the migration checksum audit (verifyMigrationChecksums)',
        async (pool) => {
            await assert.rejects(
                verifyMigrationChecksums(pool as never, MIGRATIONS_DIR),
                /terminating/
            );
        },
    ],
    [
        'migrateUp',
        async (pool) => {
            await assert.rejects(
                migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR }),
                /terminating/
            );
        },
    ],
    [
        'migrateDown',
        async (pool) => {
            await assert.rejects(
                migrateDown({
                    pool: pool as never,
                    migrationsDir: MIGRATIONS_DIR,
                    targetOrdinal: 10,
                }),
                /terminating/
            );
        },
    ],
    [
        'the migration status (status)',
        async (pool) => {
            await assert.rejects(
                status({ pool: pool as never, migrationsDir: MIGRATIONS_DIR }),
                /terminating/
            );
        },
    ],
];

for (const [name, run] of checkoutCases) {
    test(`${name}: a checkout whose backend the server ends under its query is destroyed, not handed out again`, async (t) => {
        const lines = captureLogs(t);
        const pool = (openPool = await sharedPoolOfFakes());
        (await pool.connect()).release();
        const first = FakeConnection.made[0];
        first.terminateUnderNextQuery(terminated(), 1_000);

        await run(pool, lines);

        assert.equal(first.ended, true, 'the dead connection was destroyed, not pooled');
        const next = await pool.connect();
        assert.equal(FakeConnection.made.length, 2, 'the next checkout is not the dead connection');
        await next.query('SELECT 1');
        next.release();
    });
}

/**
 * The store's checkouts after boot, which run un-awaited on its apply chain:
 * the re-hydrate after each LISTEN reconnect, the read-back by key of a peer's
 * change ('u' or 'k'; a re-read of this process's own keys after a targeted
 * write takes the same path), and the reload of a table ('r'). The store loads
 * at boot on one healthy connection, which goes back to the pool idle, and the
 * server ends that backend under the next query. The peer-change and re-hydrate
 * tests above use a pool whose release() ignores its argument, so they cannot
 * tell a client given back with its error from one pooled again.
 */
const afterBootCases: Array<
    [string, (transport: ReturnType<typeof stubTransport>) => void, string]
> = [
    [
        'the re-hydrate after a LISTEN reconnect (PostgresBackedDb.rehydrateAll)',
        (transport) => transport.reconnect(),
        'pg_store_rehydrate_failed',
    ],
    [
        'a peer change read back from Postgres (PostgresBackedDb.applyPeerChange)',
        (transport) => transport.peer({ src: 'peer-replica', m: 'users', op: 'u', kv: ['u1'] }),
        'pg_store_peer_refresh_failed',
    ],
    [
        "a peer's change to several keys read back by key (PostgresBackedDb.refreshKeys, op k)",
        (transport) =>
            transport.peer({ src: 'peer-replica', m: 'users', op: 'k', kvs: [['u1'], ['u2']] }),
        'pg_store_peer_refresh_failed',
    ],
    [
        "a peer's table reload (PostgresBackedDb.reloadTable, op r)",
        (transport) => transport.peer({ src: 'peer-replica', m: 'users', op: 'r' }),
        'pg_store_peer_refresh_failed',
    ],
];

for (const [name, deliver, failure] of afterBootCases) {
    test(`${name}: a checkout whose backend the server ends under its query is destroyed, not handed out again`, async (t) => {
        const lines = captureLogs(t);
        const pool = (openPool = await sharedPoolOfFakes());
        const transport = stubTransport();
        const store = new PostgresBackedDb();
        await store.init(pool as never, transport as never);
        t.after(() => store.shutdown());
        assert.equal(FakeConnection.made.length, 1, 'boot loaded on one connection');
        assert.ok(
            FakeConnection.executed.some((e) => e.sql.startsWith('SELECT * FROM users')),
            'boot loaded the users table'
        );
        const first = FakeConnection.made[0];
        first.terminateUnderNextQuery(terminated(), 1_000);

        deliver(transport);
        await waitFor(() => logged(lines, failure).length > 0, failure);
        assert.match(String(logged(lines, failure)[0].error), /terminating/);

        assert.equal(first.ended, true, 'the dead connection was destroyed, not pooled');
        const next = await pool.connect();
        assert.equal(FakeConnection.made.length, 2, 'the next checkout is not the dead connection');
        await next.query('SELECT 1');
        next.release();
    });
}

/** Take the leader lock on the shared pool's first connection, watch it, and give it back. */
const leadWatchAndRelease = async (pool: SharedPool) => {
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    const conn = FakeConnection.made[0];
    const watch = { lost: 0 };
    watchBackgroundLeadership(() => (watch.lost += 1));
    await releaseBackgroundLeader();
    assert.equal(isBackgroundLeader(), false);
    return { conn, watch };
};

test('giving the leader lock back stops its watch: that connection failing later in the pool does not end the process', async (t) => {
    const lines = captureLogs(t);
    const pool = (openPool = await sharedPoolOfFakes());
    const { conn, watch } = await leadWatchAndRelease(pool);

    // It fails while idle in the pool (a restart, a failover, an idle-session
    // timeout). A watch still on it would give it back to the pool a second
    // time, and pg-pool throws on that, inside the 'error' listener.
    assert.doesNotThrow(() => conn.fail(terminated()));
    assert.equal(watch.lost, 0, 'a lock given back is not reported lost');
    assert.deepEqual(logged(lines, 'background_leader_lost'), []);
    assert.equal(logged(lines, 'pg_pool_client_error')[0]?.state, 'idle');
    assert.equal(conn.ended, true, 'the pool dropped it');
});

test('giving the leader lock back stops its watch: no lock check destroys that connection under its next holder', async (t) => {
    captureLogs(t);
    t.mock.timers.enable({ apis: ['setInterval'] });
    const pool = (openPool = await sharedPoolOfFakes());
    const { conn, watch } = await leadWatchAndRelease(pool);

    // pg-pool hands out its newest idle client first: the next checkout is the
    // former leader connection. A lock check falls due while it is held.
    const next = await pool.connect();
    assert.equal(FakeConnection.made.length, 1, 'the former leader connection, reused');
    t.mock.timers.tick(10_000);
    await sleep(50);
    assert.equal(conn.ended, false, 'not destroyed under its new holder');
    assert.equal(watch.lost, 0);
    await next.query('SELECT 1');
    next.release();
    assert.equal(pool.totalCount, 1, 'pooled again');
});

/** What the stand-in connections were sent: the lock's statements by name, the rest as text. */
const sentToFakes = (): string[] =>
    FakeConnection.executed.map(
        ({ connection, sql, params }) =>
            `${connection}: ${
                sql.includes('pg_try_advisory_lock')
                    ? 'lock'
                    : sql.includes('pg_advisory_unlock')
                    ? 'unlock'
                    : isRaise(sql)
                    ? `raise timeout to ${String(params?.[0])}`
                    : sql
            }`
    );

/**
 * A server whose sessions start with this idle_session_timeout, in
 * milliseconds. It answers the lock connection's statement as PostgreSQL
 * does: the value it found, and what it raised it to where that was set and
 * under the floor the statement names. What PostgreSQL itself answers, and
 * does to the session, is in the PGlite tests after these.
 */
const sessionTimeout =
    (setting: number) =>
    (sql: string, params?: unknown[]): { rows: unknown[] } | undefined => {
        if (!isRaise(sql)) return undefined;
        const floorMs = Number(params?.[0]);
        const raised = setting > 0 && setting < floorMs;
        return { rows: [{ setting: String(setting), raised_to: raised ? `${floorMs}ms` : null }] };
    };

/** The idle-session statement refused, on a connection that stays up. */
const refused = (): Error => Object.assign(new Error('permission denied'), { code: '42501' });

/** Long enough for a stand-in connection to answer what it has been sent. */
const answered = () => sleep(20);

/**
 * Make `conn` answer one statement at a time, in the order sent, as a real
 * connection does, and the statement `held` picks only once the returned
 * function is called.
 */
const holdAnswerTo = (conn: FakeConnection, held: (sql: string) => boolean): (() => void) => {
    let letGo: () => void = () => undefined;
    const gate = new Promise<void>((r) => (letGo = r));
    const query = conn.query.bind(conn);
    let last: Promise<unknown> = Promise.resolve();
    conn.query = (sql = '', params?: unknown[]) => {
        const answer = last
            .then(() => (held(sql) ? gate : undefined))
            .then(() => query(sql, params));
        last = answer.catch(() => undefined);
        return answer;
    };
    return letGo;
};

test('a leader lock that is held but not watched is sent nothing about the idle-session timeout', async (t) => {
    captureLogs(t);
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    FakeConnection.respond = sessionTimeout(3000);
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    await answered();
    assert.deepEqual(sentToFakes(), ['0: lock']);

    await releaseBackgroundLeader();
    assert.deepEqual(sentToFakes(), ['0: lock', '0: unlock']);
    assert.equal(FakeConnection.made[0].ended, false, 'pooled');
});

// One statement, whatever the server's timeout: it names the floor, 30 s with
// the default 10 s between lock checks, and the server decides.
for (const [setting, raised] of [
    [3000, true],
    [0, false],
    [45000, false],
] as const) {
    test(`a watched leader-lock connection whose server ${
        raised
            ? 'raised its idle-session timeout logs that, and puts it back when the lock is given up'
            : `left its idle-session timeout of ${setting} ms alone logs nothing, and puts nothing back`
    }`, async (t) => {
        captureLogs(t);
        const info = captureInfo(t);
        const pool = (openPool = await sharedPoolOfFakes());
        t.after(() => releaseBackgroundLeader());
        FakeConnection.respond = sessionTimeout(setting);
        assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
        watchBackgroundLeadership(() => assert.fail('no loss expected'));
        await answered();
        assert.deepEqual(sentToFakes(), ['0: lock', '0: raise timeout to 30000']);
        assert.deepEqual(
            logged(info, 'pg_idle_session_timeout_raised').map((e) => [e.level, e.fromMs, e.toMs]),
            raised ? [['info', setting, 30_000]] : []
        );
        assert.deepEqual(logged(info, 'pg_idle_session_timeout_not_raised'), []);

        const before = sentToFakes().length;
        await releaseBackgroundLeader();
        assert.deepEqual(
            sentToFakes().slice(before),
            raised ? ['0: unlock', `0: ${RESTORE}`] : ['0: unlock']
        );
        assert.equal(FakeConnection.made[0].ended, false, 'pooled');
        assert.equal(pool.totalCount, 1);
    });
}

test("the floor the statement names is three of the watch's own lock-check intervals: 3 s with 1 s between checks", async (t) => {
    captureLogs(t);
    captureInfo(t);
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    FakeConnection.respond = sessionTimeout(2999);
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    watchBackgroundLeadership(() => assert.fail('no loss expected'), { checkIntervalMs: 1_000 });
    await answered();
    assert.deepEqual(sentToFakes(), ['0: lock', '0: raise timeout to 3000']);
});

test('a connection that does not get the leader lock goes back to the pool as it came', async (t) => {
    captureLogs(t);
    const pool = (openPool = await sharedPoolOfFakes());
    FakeConnection.respond = (sql) =>
        sql.includes('pg_try_advisory_lock') ? { rows: [{ locked: false }] } : undefined;
    assert.equal(await acquireBackgroundLeaderLock(pool as never), false);
    assert.equal(isBackgroundLeader(), false);
    assert.deepEqual(sentToFakes(), ['0: lock'], 'the idle-session timeout was left alone');
    assert.equal(FakeConnection.made[0].ended, false, 'pooled');
});

test('a server with no idle-session timeout (older than PostgreSQL 14) keeps its leader lock; nothing is put back, and that is logged once', async (t) => {
    captureLogs(t);
    const info = captureInfo(t);
    forgetIdleSessionFailuresForTests();
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    // pg_settings has no such row there, so the statement comes back empty.
    FakeConnection.respond = (sql) => (isRaise(sql) ? { rows: [] } : undefined);
    let lost = 0;
    for (let round = 0; round < 2; round++) {
        assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
        watchBackgroundLeadership(() => (lost += 1));
        await answered();
        assert.equal(isBackgroundLeader(), true);
        await releaseBackgroundLeader();
    }
    assert.deepEqual(sentToFakes(), [
        '0: lock',
        '0: raise timeout to 30000',
        '0: unlock',
        '0: lock',
        '0: raise timeout to 30000',
        '0: unlock',
    ]);
    assert.equal(lost, 0, 'the lock was never reported lost');
    assert.equal(FakeConnection.made[0].ended, false, 'pooled');
    const lines = logged(info, 'pg_idle_session_timeout_not_raised');
    assert.equal(lines.length, 1, 'two locks, one line');
    assert.equal(lines[0].level, 'info');
    assert.equal(lines[0].reason, 'no_such_setting');
});

test('a server that refuses the idle-session statement still gives the leader lock; the refusal is logged once, after the connection has answered another statement, and nothing is put back', async (t) => {
    captureLogs(t);
    const info = captureInfo(t);
    forgetIdleSessionFailuresForTests();
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    FakeConnection.respond = (sql) => (isRaise(sql) ? refused() : undefined);
    let lost = 0;
    for (let round = 0; round < 2; round++) {
        assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
        watchBackgroundLeadership(() => (lost += 1));
        await answered();
        assert.equal(isBackgroundLeader(), true);
        assert.equal(FakeConnection.made[0].ended, false, 'the connection is kept');
        await releaseBackgroundLeader();
    }
    assert.deepEqual(sentToFakes(), [
        '0: lock',
        '0: raise timeout to 30000',
        // Whether the connection outlived the failure: it answers.
        `0: ${STILL_THERE}`,
        '0: unlock',
        '0: lock',
        '0: raise timeout to 30000',
        // Nothing is asked once the process has logged a refusal.
        '0: unlock',
    ]);
    assert.equal(lost, 0, 'the lock was never reported lost');
    assert.equal(FakeConnection.made[0].ended, false, 'pooled');
    const refusals = logged(info, 'pg_idle_session_timeout_not_raised');
    assert.equal(refusals.length, 1, 'two refusals, one line');
    assert.equal(refusals[0].level, 'info');
    assert.equal(refusals[0].reason, 'failed');
    assert.equal(refusals[0].code, '42501');
    assert.equal(refusals[0].error, 'permission denied');
    assertSecretFree(JSON.stringify(refusals[0]));
});

test('a leader lock given up while its idle-session statement is out still puts a raised timeout back, and logs no raise', async (t) => {
    captureLogs(t);
    const info = captureInfo(t);
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    (await pool.connect()).release();
    const conn = FakeConnection.made[0];
    FakeConnection.respond = sessionTimeout(3000);
    const answerRaise = holdAnswerTo(conn, isRaise);

    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    watchBackgroundLeadership(() => assert.fail('no loss expected'));
    // The statement is out, and the server raises the timeout when it gets
    // it, wanted or not. The unlock is sent behind it, so the statement is
    // answered first, and the release knows of the raise.
    const released = releaseBackgroundLeader();
    answerRaise();
    await released;
    await answered();
    assert.deepEqual(sentToFakes(), [
        '0: lock',
        '0: raise timeout to 30000',
        '0: unlock',
        `0: ${RESTORE}`,
    ]);
    assert.deepEqual(logged(info, 'pg_idle_session_timeout_raised'), []);
    assert.equal(conn.ended, false, 'pooled once the timeout is back');
    assert.equal(pool.totalCount, 1);
});

test('a leader lock given up while its idle-session statement is out, and refused, has nothing more sent on the connection it gives back', async (t) => {
    captureLogs(t);
    const info = captureInfo(t);
    forgetIdleSessionFailuresForTests();
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    (await pool.connect()).release();
    const conn = FakeConnection.made[0];
    FakeConnection.respond = (sql) => (isRaise(sql) ? refused() : undefined);
    const answerRaise = holdAnswerTo(conn, isRaise);

    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    watchBackgroundLeadership(() => assert.fail('no loss expected'));
    const released = releaseBackgroundLeader();
    answerRaise();
    await released;
    await answered();
    // No statement asking whether the connection is still there: it would
    // run on a connection the pool may have handed to someone else.
    assert.deepEqual(sentToFakes(), ['0: lock', '0: raise timeout to 30000', '0: unlock']);
    assert.deepEqual(logged(info, 'pg_idle_session_timeout_not_raised'), []);
    assert.equal(conn.ended, false, 'pooled as it came');
});

/**
 * Take the lock on the pool's one idle connection and watch it, with the
 * server ending that backend under the idle-session statement: pg rejects the
 * statement with the server's FATAL, and reports the drop when the socket
 * closes. Resolves once the watch has reported the loss.
 */
const loseLockUnderIdleSessionStatement = async (pool: SharedPool): Promise<FakeConnection> => {
    (await pool.connect()).release();
    const conn = FakeConnection.made[FakeConnection.made.length - 1];
    conn.terminateUnderQuery(/idle_session_timeout/, terminated());
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    const lost: string[] = [];
    watchBackgroundLeadership((reason) => lost.push(reason));
    await waitFor(() => lost.length === 1, 'the watch to report the loss');
    assert.deepEqual(lost, ['connection_error']);
    assert.equal(isBackgroundLeader(), false);
    return conn;
};

test('a leader-lock connection the server ends while the idle-session statement is out is reported lost by the watch, and logged as a drop, not as a refusal', async (t) => {
    const lines = captureLogs(t);
    const info = captureInfo(t);
    forgetIdleSessionFailuresForTests();
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    const heldBefore = counted('held');

    const conn = await loseLockUnderIdleSessionStatement(pool);
    assert.equal(conn.ended, true, 'the dead connection was destroyed');
    // The connection was still checked out when its socket closed, so the
    // drop is the connection's own report: logged and counted once, as held.
    const drops = logged(lines, 'pg_pool_client_error');
    assert.deepEqual(
        drops.map((e) => [e.state, e.error]),
        [['held', 'Connection terminated unexpectedly']]
    );
    assert.equal(counted('held'), heldBefore + 1);
    assert.deepEqual(
        logged(info, 'pg_idle_session_timeout_not_raised'),
        [],
        "the server's FATAL to the statement is not a refusal of it"
    );
    // The statement asking whether the connection was still there got no
    // answer: pg holds a statement sent after a FATAL until the socket closes.
    assert.deepEqual(sentToFakes(), ['0: lock']);
});

test('a refusal of the idle-session statement is still logged in a process whose lock connection the server ended under that statement before', async (t) => {
    captureLogs(t);
    const info = captureInfo(t);
    forgetIdleSessionFailuresForTests();
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    await loseLockUnderIdleSessionStatement(pool);

    // The lock is taken again, on a new connection, and this time the server
    // refuses the statement. The line is logged once per process: a drop
    // logged as a refusal before would have used it up.
    FakeConnection.respond = (sql) => (isRaise(sql) ? refused() : undefined);
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    watchBackgroundLeadership(() => assert.fail('no loss expected'));
    await answered();
    assert.deepEqual(
        logged(info, 'pg_idle_session_timeout_not_raised').map((e) => [e.reason, e.code]),
        [['failed', '42501']]
    );
    assert.equal(FakeConnection.made.length, 2, 'on a new connection');
});

test('a leader-lock connection reset while the idle-session statement is out is reported lost at once, not at the next lock check', async (t) => {
    const lines = captureLogs(t);
    const info = captureInfo(t);
    forgetIdleSessionFailuresForTests();
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    (await pool.connect()).release();
    const conn = FakeConnection.made[0];
    // A network reset under the statement. On a connection that has sent a
    // parameterized statement, as the lock statement is, pg 8.20.0 passes over
    // the socket's ECONNRESET (Connection.sync() leaves the connection marked
    // as ending) and reports the drop when the socket closes: 'error' on the
    // client first, and only then the rejection of the statement in flight.
    const closed = new Error('Connection terminated unexpectedly');
    const query = conn.query.bind(conn);
    conn.query = (sql = '', params?: unknown[]) =>
        isRaise(sql)
            ? new Promise<{ rows: unknown[] }>((_resolve, reject) =>
                  setImmediate(() => {
                      conn.fail(closed);
                      reject(closed);
                  })
              )
            : query(sql, params);

    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    const lost: string[] = [];
    watchBackgroundLeadership((reason) => lost.push(reason));
    // The lock is reported taken with nothing about the timeout sent or
    // waited for, and the watch sends the statement once it listens. Waited
    // for before the lock was reported taken, the reset arrived with no watch
    // on the connection, and nothing told the process it had lost the lock
    // until the first lock check, 10 s later.
    await waitFor(() => lost.length === 1, 'the watch to report the loss', 2_000);
    assert.deepEqual(lost, ['connection_error']);
    assert.equal(isBackgroundLeader(), false);
    assert.equal(conn.ended, true, 'the dead connection was destroyed');
    const drops = logged(lines, 'pg_pool_client_error');
    assert.equal(drops.length, 1, 'one drop, logged once');
    assert.equal(drops[0].state, 'held');
    await answered();
    assert.deepEqual(
        logged(info, 'pg_idle_session_timeout_not_raised'),
        [],
        'a statement that failed with its connection is not logged as a refusal'
    );
    assert.deepEqual(sentToFakes(), ['0: lock'], 'and nothing more was sent on it');
});

test('a leader-lock connection whose raised idle-session timeout cannot be put back is destroyed, not pooled', async (t) => {
    captureLogs(t);
    captureInfo(t);
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    const timeout = sessionTimeout(3000);
    FakeConnection.respond = (sql, params) =>
        sql === RESTORE
            ? Object.assign(new Error('canceling statement due to statement timeout'), {
                  code: '57014',
              })
            : timeout(sql, params);
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    watchBackgroundLeadership(() => assert.fail('no loss expected'));
    await answered();
    await releaseBackgroundLeader();
    assert.deepEqual(sentToFakes(), [
        '0: lock',
        '0: raise timeout to 30000',
        '0: unlock',
        `0: ${RESTORE}`,
    ]);
    assert.equal(FakeConnection.made[0].ended, true, 'destroyed');
    assert.equal(pool.totalCount, 0);
});

// What PostgreSQL itself does with the lock connection's statement. PGlite is
// PostgreSQL (17.5) built to run inside this process: one session, no server,
// so these run wherever the rest of this file does. The statement and the
// RESET are sent by the functions the watch and the release call
// (db/pooledClient.ts). A session's timeout is set here with SET, so RESET
// puts back PGlite's default, which is off; a role's or database's default
// being put back on a server is in the real-PostgreSQL file.
let pglite: InstanceType<typeof PGlite> | null = null;
after(async () => {
    await pglite?.close();
});
const pgliteSession = async (t: { after(fn: () => Promise<void>): void }) => {
    const db = (pglite ??= new PGlite());
    t.after(async () => {
        await db.query('DROP VIEW IF EXISTS pg_temp.pg_settings');
        await db.query('RESET idle_session_timeout');
    });
    return {
        db,
        client: { query: (sql: string, params?: unknown[]) => db.query(sql, params as never) },
        timeout: async (): Promise<string> =>
            (await db.query<{ idle_session_timeout: string }>('SHOW idle_session_timeout')).rows[0]
                .idle_session_timeout,
    };
};

// By the session's timeout, with a floor of 30 s: what SHOW gives afterwards.
for (const [setting, after, raised] of [
    [0, '0', false],
    [1, '30s', true],
    [3000, '30s', true],
    [12000, '30s', true],
    [29999, '30s', true],
    [30000, '30s', false],
    [45000, '45s', false],
] as const) {
    test(`PostgreSQL (PGlite): a session whose idle_session_timeout is ${setting} ms is ${
        raised
            ? 'raised to 30 s, not turned off, and RESET puts that back'
            : 'left alone, and nothing is put back'
    }`, async (t) => {
        const info = captureInfo(t);
        const { db, client, timeout } = await pgliteSession(t);
        await db.query(`SET idle_session_timeout = ${setting}`);

        await raiseIdleSessionTimeoutTo(client, 30_000, () => true);
        assert.equal(await timeout(), after);
        assert.deepEqual(
            logged(info, 'pg_idle_session_timeout_raised').map((e) => [e.fromMs, e.toMs]),
            raised ? [[setting, 30_000]] : []
        );
        assert.deepEqual(logged(info, 'pg_idle_session_timeout_not_raised'), []);

        await restoreIdleSessionTimeout(client);
        assert.equal(await timeout(), raised ? '0' : after, raised ? 'RESET was sent' : 'no RESET');
    });
}

test('PostgreSQL (PGlite): the floor is the one the caller names: 2999 ms is raised to 3 s, 3000 ms is left alone', async (t) => {
    captureInfo(t);
    const { db, client, timeout } = await pgliteSession(t);
    await db.query('SET idle_session_timeout = 2999');
    await raiseIdleSessionTimeoutTo(client, 3_000, () => true);
    assert.equal(await timeout(), '3s');
    await restoreIdleSessionTimeout(client);

    await db.query('SET idle_session_timeout = 3000');
    await raiseIdleSessionTimeoutTo(client, 3_000, () => true);
    assert.equal(await timeout(), '3s');
    await restoreIdleSessionTimeout(client);
    assert.equal(await timeout(), '3s', 'nothing was put back: it had not been raised');
});

// The statement names pg_settings without a schema, and PostgreSQL looks in a
// session's temporary schema first. A temporary view of that name therefore
// stands in for the catalog's in this one session, which is how the answers
// no PostgreSQL 16 or 17 gives are reached on the engine itself.
for (const [what, view] of [
    [
        'has no idle_session_timeout (as before PostgreSQL 14)',
        `SELECT name, setting, unit FROM pg_catalog.pg_settings WHERE name <> 'idle_session_timeout'`,
    ],
    [
        'gives its idle_session_timeout in another unit than milliseconds',
        `SELECT 'idle_session_timeout'::text AS name, '3'::text AS setting, 's'::text AS unit`,
    ],
] as const) {
    test(`PostgreSQL (PGlite): a server that ${what} has nothing changed, and that is logged`, async (t) => {
        const info = captureInfo(t);
        forgetIdleSessionFailuresForTests();
        const { db, client, timeout } = await pgliteSession(t);
        await db.query('SET idle_session_timeout = 3000');
        await db.query(`CREATE TEMP VIEW pg_settings AS ${view}`);

        await raiseIdleSessionTimeoutTo(client, 30_000, () => true);
        assert.equal(await timeout(), '3s', 'the session is as it was');
        assert.deepEqual(logged(info, 'pg_idle_session_timeout_raised'), []);
        assert.deepEqual(
            logged(info, 'pg_idle_session_timeout_not_raised').map((e) => e.reason),
            ['no_such_setting']
        );
        await restoreIdleSessionTimeout(client);
        assert.equal(await timeout(), '3s', 'and nothing is put back');
    });
}

test('PostgreSQL (PGlite): a statement the server refuses leaves the session as it was, and is logged as a refusal because the session still answers', async (t) => {
    const info = captureInfo(t);
    forgetIdleSessionFailuresForTests();
    const { db, client, timeout } = await pgliteSession(t);
    await db.query('SET idle_session_timeout = 3000');
    // A setting that is not a number: the statement fails on the server.
    await db.query(
        `CREATE TEMP VIEW pg_settings AS
         SELECT 'idle_session_timeout'::text AS name, 'soon'::text AS setting, 'ms'::text AS unit`
    );

    await raiseIdleSessionTimeoutTo(client, 30_000, () => true);
    assert.equal(await timeout(), '3s', 'the session is as it was');
    const refusals = logged(info, 'pg_idle_session_timeout_not_raised');
    assert.deepEqual(
        refusals.map((e) => [e.reason, e.code]),
        [['failed', '22P02']]
    );
    await restoreIdleSessionTimeout(client);
    assert.equal(await timeout(), '3s', 'and nothing is put back');
});

test('an API that runs the loops itself stays up when its leader-lock connection fails, stops the loops, and takes the lock again on a new connection', async (t) => {
    const { runBackgroundLoopsWhileLeader } = await import('../src/inProcessBackgroundLoops');
    const lines = captureLogs(t);
    const pool = (openPool = await sharedPoolOfFakes());
    const loops = { started: 0, stopped: 0 };
    // The lock as src/index.ts takes it in postgres mode, on the shared pool.
    const inProcess = runBackgroundLoopsWhileLeader({
        leadership: {
            tryAcquire: () => acquireBackgroundLeaderLock(pool as never),
            watch: (onLost) => watchBackgroundLeadership(onLost),
        },
        startLoops: () => {
            loops.started += 1;
            return {
                ready: Promise.resolve(),
                stop: () => {
                    loops.stopped += 1;
                },
            };
        },
        retryMs: 50,
    });
    t.after(async () => {
        await inProcess.stop();
        await releaseBackgroundLeader();
    });
    await waitFor(() => loops.started === 1, 'the loops to start');
    const first = FakeConnection.made[0];

    // A Postgres restart, a failover or a network reset drops the connection
    // the lock is held on.
    assert.doesNotThrow(() => first.fail(terminated()));
    assert.equal(loops.stopped, 1, 'the loops stopped with the lock');
    assert.equal(first.ended, true, 'the dead connection was destroyed');
    assert.equal(logged(lines, 'background_leader_lost')[0]?.reason, 'connection_error');
    assert.equal(logged(lines, 'pg_pool_client_error')[0]?.state, 'held');

    await waitFor(() => loops.started === 2, 'the loops to start again');
    assert.equal(isBackgroundLeader(), true, 'the lock was taken again');
    assert.equal(FakeConnection.made.length, 2, 'on a new connection');
    assert.deepEqual(
        FakeConnection.executed
            .filter((e) => e.sql.includes('pg_try_advisory_lock'))
            .map((e) => e.connection),
        [0, 1]
    );
});
