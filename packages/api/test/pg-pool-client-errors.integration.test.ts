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
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const { clearSharedPgPool, getSharedPgPool } = await import('../src/config/postgres');
const { dbPoolClientErrorsTotal } = await import('../src/telemetry/metrics');
const { PgNotifyTransport } = await import('../src/db/pgNotify');
const { forgetIdleSessionExemptionFailureForTests } = await import('../src/db/pooledClient');
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
    static executed: Array<{ connection: number; sql: string }> = [];
    /**
     * The server's answer to a statement, where a test needs another than the
     * default: rows, or an error the statement is refused with while the
     * connection stays up.
     */
    static respond: ((sql: string) => { rows: unknown[] } | Error | undefined) | null = null;
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
        FakeConnection.executed.push({ connection: FakeConnection.made.indexOf(this), sql });
        const answer = FakeConnection.respond?.(sql);
        if (answer instanceof Error) throw answer;
        if (answer) return answer;
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
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

// The two connections a process holds idle on purpose (the LISTEN connection
// and the background-leader lock's) turn the server's idle_session_timeout off
// for their own session, and put it back before they return to the pool.
const EXEMPT = 'SET idle_session_timeout = 0';
const RESTORE = 'RESET idle_session_timeout';
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
    forgetIdleSessionExemptionFailureForTests();
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

/** What the stand-in connections were sent: the lock statements by name, the rest as text. */
const sentToFakes = (): string[] =>
    FakeConnection.executed.map(
        ({ connection, sql }) =>
            `${connection}: ${
                sql.includes('pg_try_advisory_lock')
                    ? 'lock'
                    : sql.includes('pg_advisory_unlock')
                    ? 'unlock'
                    : sql
            }`
    );

test('the leader-lock connection turns the idle-session timeout off once it holds the lock, and puts it back when the lock is given up', async (t) => {
    captureLogs(t);
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    assert.deepEqual(sentToFakes(), ['0: lock', `0: ${EXEMPT}`]);

    await releaseBackgroundLeader();
    assert.deepEqual(sentToFakes().slice(2), ['0: unlock', `0: ${RESTORE}`]);
    assert.equal(FakeConnection.made[0].ended, false, 'pooled once the timeout is back');
    assert.equal(pool.totalCount, 1);
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

test('a server that refuses the idle-session statement still gives the leader lock, and nothing is put back when the lock is given up', async (t) => {
    captureLogs(t);
    const info = captureInfo(t);
    forgetIdleSessionExemptionFailureForTests();
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    FakeConnection.respond = (sql) => (sql === EXEMPT ? unrecognized() : undefined);
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    assert.equal(isBackgroundLeader(), true);
    let lost = 0;
    watchBackgroundLeadership(() => (lost += 1));
    assert.equal(FakeConnection.made[0].ended, false, 'the connection is kept');
    const refusals = logged(info, 'pg_idle_session_timeout_not_exempted');
    assert.equal(refusals.length, 1);
    assert.equal(refusals[0].code, '42704');
    assertSecretFree(JSON.stringify(refusals[0]));

    await releaseBackgroundLeader();
    assert.deepEqual(sentToFakes(), ['0: lock', `0: ${EXEMPT}`, '0: unlock']);
    assert.equal(FakeConnection.made[0].ended, false, 'pooled');
    assert.equal(lost, 0, 'the lock was never reported lost');
});

test('a leader-lock connection dropped while the idle-session statement is out is reported lost by the watch', async (t) => {
    const lines = captureLogs(t);
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    // The pool's one idle connection, so the lock attempt checks it out.
    (await pool.connect()).release();
    const conn = FakeConnection.made[0];
    // The server ends the backend under the idle-session statement: pg rejects
    // that statement, and reports the drop when the socket closes.
    conn.terminateUnderQuery(/idle_session_timeout/, terminated());

    // The failed statement is passed over, so the lock counts as taken...
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    const lost: string[] = [];
    watchBackgroundLeadership((reason) => lost.push(reason));
    // ...until the watch, on from the moment the lock is reported taken, hears
    // of the drop.
    await waitFor(() => lost.length === 1, 'the watch to report the loss');
    assert.deepEqual(lost, ['connection_error']);
    assert.equal(isBackgroundLeader(), false);
    assert.equal(conn.ended, true, 'the dead connection was destroyed');
    assert.equal(logged(lines, 'pg_pool_client_error')[0]?.state, 'held');
});

test('a leader-lock connection whose idle-session timeout cannot be put back is destroyed, not pooled', async (t) => {
    captureLogs(t);
    const pool = (openPool = await sharedPoolOfFakes());
    t.after(() => releaseBackgroundLeader());
    FakeConnection.respond = (sql) =>
        sql === RESTORE
            ? Object.assign(new Error('canceling statement due to statement timeout'), {
                  code: '57014',
              })
            : undefined;
    assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
    await releaseBackgroundLeader();
    assert.deepEqual(sentToFakes(), ['0: lock', `0: ${EXEMPT}`, '0: unlock', `0: ${RESTORE}`]);
    assert.equal(FakeConnection.made[0].ended, true, 'destroyed');
    assert.equal(pool.totalCount, 0);
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
