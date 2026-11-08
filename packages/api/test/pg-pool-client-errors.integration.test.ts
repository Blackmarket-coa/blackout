// A failed pooled Postgres connection must not end the process.
//
// pg clients are EventEmitters, and an 'error' nobody listens for throws. The
// shared pool (config/postgres.ts) is a real pg Pool here; only its
// connections are stand-ins (pg-pool builds them from `pool.Client`), so no
// database is needed. A stand-in fails the way pg's client does: it marks
// itself unqueryable, then emits 'error' (pg's Client._handleErrorEvent); or,
// for a server FATAL that arrives while a query is in flight, it rejects that
// query and stays queryable until its socket closes (Client._handleErrorMessage,
// then the 'end' handler). The same drops against a real server are in
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
const { WriteBehindQueue } = await import('../src/db/writeBehindQueue');
const { PostgresBackedDb, REHYDRATE_RETRY_MS } = await import('../src/db/store');

const PASSWORD = randomBytes(12).toString('hex');
const DATABASE_URL = `postgres://pool_test_user:${PASSWORD}@pool-test-host.invalid:5432/pool_test_db`;

/** A pg Client as pg-pool drives one, with no socket behind it. */
class FakeConnection extends EventEmitter {
    static made: FakeConnection[] = [];
    /** Statements that reached the server, by connection. */
    static executed: Array<{ connection: number; sql: string }> = [];
    _queryable = true;
    _ending = false;
    ended = false;
    /** The server ended this backend; the socket has not closed yet. */
    private dead = false;
    private fatalOnNextQuery: Error | null = null;
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

    async query(sql = ''): Promise<{ rows: unknown[] }> {
        if (!this._queryable) {
            throw new Error('Client has encountered a connection error and is not queryable');
        }
        if (this.dead) throw new Error('Connection terminated unexpectedly');
        const fatal = this.fatalOnNextQuery;
        if (fatal) {
            // The server's FATAL goes to the query in flight; pg leaves the
            // client queryable until the socket closes, a moment later, and
            // emits 'error' then only if nobody has ended the client.
            this.fatalOnNextQuery = null;
            this.dead = true;
            setTimeout(() => {
                if (!this._ending) this.fail(new Error('Connection terminated unexpectedly'));
            }, 30);
            throw fatal;
        }
        FakeConnection.executed.push({ connection: FakeConnection.made.indexOf(this), sql });
        return { rows: [] };
    }

    /** The server ends this backend while the next query is in flight. */
    terminateUnderNextQuery(err: Error): void {
        this.fatalOnNextQuery = err;
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
    await openPool?.end();
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
        // pg reports the same drop again when the socket closes.
        assert.doesNotThrow(() => dead.fail(new Error('Connection terminated unexpectedly')));
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

    // Held with no query in flight, as the background-leader lock is.
    const lines = warnings(() => {
        assert.doesNotThrow(() => dead.fail(terminated()));
        assert.doesNotThrow(() => dead.fail(new Error('Connection terminated unexpectedly')));
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

/** The LISTEN connection PgNotifyTransport holds. */
class FakeListenClient extends EventEmitter {
    queries: string[] = [];
    released: Array<'pooled' | Error> = [];
    async query(sql: string): Promise<unknown> {
        this.queries.push(sql);
        return {};
    }
    release(err?: Error): void {
        this.released.push(err ?? 'pooled');
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

    const lines = warnings(() => {
        clients[0].emit('error', terminated());
        clients[0].emit('error', new Error('Connection terminated unexpectedly'));
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
    assert.deepEqual(clients[1].queries, ['LISTEN blackout_store_change']);
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
                // pg rejects LISTEN with the server's FATAL first, and emits
                // 'error' only when the socket closes.
                c.query = async (sql: string) => {
                    c.queries.push(sql);
                    setTimeout(
                        () => c.emit('error', new Error('Connection terminated unexpectedly')),
                        30
                    );
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

const probePlan = {
    descriptor: {
        mapName: 'probe',
        tableName: 'probe_wb',
        keyOf: (r: Record<string, unknown>) => String(r.id),
        conflictColumns: ['id'],
    },
    columns: [
        { name: 'id', dataType: 'text', nullable: false },
        { name: 'v', dataType: 'text', nullable: true },
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
    const queue = new WriteBehindQueue(
        pool as never,
        new Map([['probe', probePlan]]) as never,
        () => undefined
    );
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

/** A pool for PostgresBackedDb that can refuse new connections; one table, users. */
const storePool = () => {
    const state = {
        refuse: false,
        users: [] as Array<Record<string, unknown>>,
    };
    const client = {
        async query(sql: string, params?: unknown[]) {
            if (sql.includes('information_schema.columns')) {
                const users = [
                    { column_name: 'id', data_type: 'text', is_nullable: 'NO' },
                    { column_name: 'username', data_type: 'text', is_nullable: 'NO' },
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

type Payload = { src: string; m: string; op: 'u' | 'r'; kv?: string[] };

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

test('a peer change or a re-hydrate that cannot get a connection does not end the process, and the re-hydrate is retried', async (t) => {
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
    transport.reconnect();
    await sleep(100);
    assert.deepEqual(rejections, [], 'no unhandled rejection');
    const [peer] = logged(lines, 'pg_store_peer_refresh_failed');
    assert.equal(peer?.map, 'users');
    assert.match(String(peer?.error), /too many connections/);
    const [rehydrate] = logged(lines, 'pg_store_rehydrate_failed');
    assert.equal(rehydrate?.retryInMs, REHYDRATE_RETRY_MS);

    // Postgres takes connections again, and holds a user this mirror missed.
    state.refuse = false;
    state.users = [{ id: 'u-missed', username: 'missed' }];
    const deadline = Date.now() + REHYDRATE_RETRY_MS + 3_000;
    while (!store.getUserById('u-missed') && Date.now() < deadline) await sleep(50);
    assert.equal(store.getUserById('u-missed')?.username, 'missed', 'the retry re-hydrated');
    assert.equal(logged(lines, 'pg_store_rehydrate_failed').length, 1, 'no retry once it worked');
    assert.deepEqual(rejections, []);
});
