// A failed pooled Postgres connection must not end the process.
//
// pg clients are EventEmitters, and an 'error' nobody listens for throws. The
// shared pool (config/postgres.ts) is a real pg Pool here; only its
// connections are stand-ins (pg-pool builds them from `pool.Client`), so no
// database is needed. A stand-in fails the way pg's client does: it marks
// itself unqueryable, then emits 'error' (pg's Client._handleErrorEvent). The
// same drops against a real server are in
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

const PASSWORD = randomBytes(12).toString('hex');
const DATABASE_URL = `postgres://pool_test_user:${PASSWORD}@pool-test-host.invalid:5432/pool_test_db`;

/** A pg Client as pg-pool drives one, with no socket behind it. */
class FakeConnection extends EventEmitter {
    static made: FakeConnection[] = [];
    _queryable = true;
    _ending = false;
    ended = false;
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

    async query(): Promise<{ rows: unknown[] }> {
        if (!this._queryable) {
            throw new Error('Client has encountered a connection error and is not queryable');
        }
        return { rows: [] };
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
    // A plain release(), as every holder in src/ does.
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
                // The first reconnect's connection drops under its LISTEN: pg
                // emits 'error' on the client and rejects the query.
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
