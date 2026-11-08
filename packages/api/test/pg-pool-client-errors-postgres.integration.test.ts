// Pooled connections dropped by a real PostgreSQL server must not end the
// process. Needs a server: set BLACKOUT_TEST_PG_URL to one (a role that may
// create databases, alter the ones it owns and terminate backends); each test
// gets its own database. Without it these tests are skipped, and no CI workflow
// sets it yet (2026-11-08), so they run only where someone points them at a
// server. pg-pool-client-errors.integration.test.ts runs everywhere with
// stand-in connections that fail in the orders pg 8.20.0 uses; it has no
// stand-in for two things only this file checks: pg's own ordering of a real
// drop, and the API exiting 1 through its drain when its leader-lock
// connection drops (the watch in src/index.ts).
//
// A backend is dropped the ways production sees it: pg_terminate_backend (what
// a restart, a failover or idle_session_timeout does to a session) and a TCP
// reset from a proxy in front of the server (a network fault).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const PG_URL = process.env.BLACKOUT_TEST_PG_URL?.trim() || undefined;
const skip = PG_URL ? false : 'set BLACKOUT_TEST_PG_URL to run against PostgreSQL';

const { clearSharedPgPool, getSharedPgPool } = await import('../src/config/postgres');
const { PgNotifyTransport } = await import('../src/db/pgNotify');
const { BACKGROUND_LEADER_LOCK_KEY } = await import('../src/services/backgroundLeader');
const { WriteBehindQueue } = await import('../src/db/writeBehindQueue');
const { introspectColumns } = await import('../src/db/pgWriter');
const { migrateUp, MIGRATIONS_DIR } = await import('../src/db/migrate');
const { PostgresBackedDb, REHYDRATE_RETRY_MS } = await import('../src/db/store');

interface Row {
    [key: string]: any;
}
interface Client {
    query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
    release(err?: Error): void;
}
interface SharedPool {
    connect(): Promise<Client>;
    end(): Promise<void>;
    totalCount: number;
}
interface Admin {
    connect(): Promise<void>;
    query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
    end(): Promise<void>;
}

const apiDir = fileURLToPath(new URL('../', import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (condition: () => boolean, label: string, ms = 5_000) => {
    const deadline = Date.now() + ms;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
        await sleep(20);
    }
};

const admin = async (url = PG_URL!): Promise<Admin> => {
    const { default: pg } = (await import('pg')) as unknown as {
        default: { Client: new (cfg: { connectionString: string }) => Admin };
    };
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    return client;
};

const urlFor = (name: string, base = PG_URL!): string => {
    const u = new URL(base);
    u.pathname = `/${name}`;
    return u.toString();
};

let databases = 0;
const created: string[] = [];
const newDatabase = async (): Promise<string> => {
    const name = `blackout_poolerr_${process.pid}_${++databases}`;
    const a = await admin();
    await a.query(`DROP DATABASE IF EXISTS ${name}`);
    await a.query(`CREATE DATABASE ${name}`);
    await a.end();
    created.push(name);
    return name;
};

after(async () => {
    if (!PG_URL || created.length === 0) return;
    const a = await admin();
    for (const name of created) await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await a.end();
});

/** Terminate backends of `database` matching `where`; returns their pids. */
const terminate = async (database: string, where: string, params: unknown[] = []) => {
    const a = await admin(urlFor(database));
    const { rows } = await a.query(
        `SELECT pid, pg_terminate_backend(pid) AS ok FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid() AND ${where}`,
        params
    );
    await a.end();
    return rows.map((r) => r.pid as number);
};

/** The shared pool, as the app makes it, on a database of its own. */
const sharedPool = async (database: string): Promise<SharedPool> => {
    clearSharedPgPool();
    process.env.DATABASE_URL = urlFor(database);
    return (await getSharedPgPool()) as unknown as SharedPool;
};

/** console.warn and console.error lines while the test runs. */
const captureWarnings = (t: { after(fn: () => void): void }): string[] => {
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

/** Unhandled rejections while the test runs; Node ends the process on one. */
const captureUnhandledRejections = (t: { after(fn: () => void): void }): unknown[] => {
    const seen: unknown[] = [];
    const onRejection = (reason: unknown) => seen.push(reason);
    process.on('unhandledRejection', onRejection);
    t.after(() => {
        process.off('unhandledRejection', onRejection);
    });
    return seen;
};
const logged = (lines: string[], msg: string): Row[] =>
    lines
        .filter((l) => l.startsWith('{'))
        .map((l) => JSON.parse(l) as Row)
        .filter((e) => e.msg === msg);

const pidOf = async (client: Client): Promise<number> =>
    (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;

test(
    'a terminated idle connection is dropped and logged; the next checkout gets a new backend',
    { skip },
    async (t) => {
        const lines = captureWarnings(t);
        const database = await newDatabase();
        const pool = await sharedPool(database);
        t.after(() => pool.end());
        const first = await pool.connect();
        const pid = await pidOf(first);
        first.release();

        assert.deepEqual(await terminate(database, 'pid = $1', [pid]), [pid]);
        await waitFor(() => pool.totalCount === 0, 'the pool to drop the dead connection');

        const [entry] = logged(lines, 'pg_pool_client_error');
        assert.equal(entry?.state, 'idle');
        assert.equal(entry?.code, '57P01');
        const next = await pool.connect();
        assert.notEqual(await pidOf(next), pid);
        next.release();
    }
);

test(
    'a held connection whose backend is terminated does not end the process; release() destroys it',
    { skip },
    async (t) => {
        const lines = captureWarnings(t);
        const database = await newDatabase();
        const pool = await sharedPool(database);
        t.after(() => pool.end());
        const held = await pool.connect();
        const pid = await pidOf(held);

        // Held with no query in flight, as the background-leader lock is.
        assert.deepEqual(await terminate(database, 'pid = $1', [pid]), [pid]);
        await waitFor(
            () => logged(lines, 'pg_pool_client_error').length > 0,
            'the drop to be logged'
        );
        await sleep(100);
        const entries = logged(lines, 'pg_pool_client_error');
        assert.equal(entries.length, 1, 'one drop, logged once');
        assert.equal(entries[0].state, 'held');
        assert.equal(entries[0].code, '57P01');

        await assert.rejects(held.query('SELECT 1'));
        held.release();
        assert.equal(pool.totalCount, 0, 'destroyed, not returned to the pool');
        const next = await pool.connect();
        assert.notEqual(await pidOf(next), pid);
        next.release();
    }
);

test('a network reset under a query in flight does not end the process', { skip }, async (t) => {
    const lines = captureWarnings(t);
    const database = await newDatabase();
    const target = new URL(urlFor(database));
    const downstream: net.Socket[] = [];
    const proxy = net.createServer((down) => {
        const up = net.connect(Number(target.port || 5432), target.hostname);
        down.pipe(up).pipe(down);
        for (const [a, b] of [
            [down, up],
            [up, down],
        ]) {
            a.on('error', () => b.destroy());
            a.on('close', () => b.destroy());
        }
        downstream.push(down);
    });
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', () => r()));
    const via = new URL(target.toString());
    via.hostname = '127.0.0.1';
    via.port = String((proxy.address() as net.AddressInfo).port);
    clearSharedPgPool();
    process.env.DATABASE_URL = via.toString();
    const pool = (await getSharedPgPool()) as unknown as SharedPool;
    // The pool first: the proxy closes once its connections have.
    t.after(async () => {
        await pool.end();
        await new Promise<void>((r) => proxy.close(() => r()));
    });

    const client = await pool.connect();
    await client.query('SELECT 1');
    const work = (async () => {
        try {
            await client.query('SELECT pg_sleep(5)');
        } finally {
            client.release();
        }
    })();
    await sleep(200);
    // The socket error reaches the client while the query is still in flight,
    // before its rejection does: the client is still checked out.
    downstream[0].resetAndDestroy();
    await assert.rejects(work, /ECONNRESET/);

    const [entry] = logged(lines, 'pg_pool_client_error');
    assert.equal(entry?.state, 'held');
    assert.equal(entry?.code, 'ECONNRESET');
    const next = await pool.connect();
    assert.equal((await next.query('SELECT 2 AS two')).rows[0].two, 2);
    next.release();
});

test(
    'a terminated LISTEN connection is replaced by exactly one, and its pool slot is freed',
    { skip },
    async (t) => {
        captureWarnings(t);
        const database = await newDatabase();
        const pool = await sharedPool(database);
        const transport = new PgNotifyTransport(pool as never);
        // The transport first: pool.end() waits for the LISTEN client it holds.
        // Bounded, so a regression that leaks LISTEN clients fails rather than
        // hangs; the database drop at the end closes what is left.
        t.after(async () => {
            await transport.close();
            let timer: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([pool.end(), new Promise((r) => (timer = setTimeout(r, 3_000)))]);
            clearTimeout(timer);
        });
        let reconnects = 0;
        transport.onReconnect(() => (reconnects += 1));
        await transport.subscribe(() => undefined);

        const listening = async () => {
            const a = await admin(urlFor(database));
            const { rows } = await a.query(
                `SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE datname = current_database() AND query ILIKE 'LISTEN%'`
            );
            await a.end();
            return rows[0].n as number;
        };
        assert.equal(await listening(), 1);
        assert.equal((await terminate(database, `query ILIKE 'LISTEN%'`)).length, 1);
        // The transport reconnects after 2 s.
        await waitFor(() => reconnects > 0, 'the LISTEN reconnect', 6_000);
        await sleep(500);
        assert.equal(reconnects, 1);
        assert.equal(await listening(), 1, 'one LISTEN session, not one per error event');
        assert.equal(pool.totalCount, 1, 'the dead LISTEN client no longer holds a pool slot');
    }
);

test(
    'an API running the loops in-process exits 1 through its drain when the leader lock connection drops',
    { skip, timeout: 120_000 },
    async (t) => {
        const database = await newDatabase();
        const probe = net.createServer();
        await new Promise<void>((r) => probe.listen(0, '127.0.0.1', () => r()));
        const port = (probe.address() as net.AddressInfo).port;
        await new Promise<void>((r) => probe.close(() => r()));

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            NODE_ENV: 'development',
            BLACKOUT_DB_MODE: 'postgres',
            DATABASE_URL: urlFor(database),
            PORT: String(port),
            JWT_SECRET_PRIMARY: generateTestJwtSecret(),
        };
        for (const key of [
            'BLACKOUT_BACKGROUND_WORKERS_DISABLED',
            'BLACKOUT_API_SKIP_LISTEN',
            'REDIS_URL',
        ]) {
            delete env[key];
        }
        const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
            cwd: apiDir,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        t.after(() => {
            if (child.exitCode === null) child.kill('SIGKILL');
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        const exited = new Promise<number | null>((r) => child.on('exit', (code) => r(code)));

        await waitFor(
            () => stdout.includes('"background_loops_started"') || child.exitCode !== null,
            'the API to start its loops',
            60_000
        );
        assert.equal(child.exitCode, null, `the API exited early:\n${stdout}\n${stderr}`);

        const pids = await terminate(
            database,
            `pid IN (SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND objid = $1::bigint::oid
                   AND database = (SELECT oid FROM pg_database WHERE datname = current_database()))`,
            [BACKGROUND_LEADER_LOCK_KEY]
        );
        assert.equal(pids.length, 1, 'the leader lock was held on one connection');

        let timer: ReturnType<typeof setTimeout> | undefined;
        const code = await Promise.race([
            exited,
            new Promise<'still running'>(
                (r) => (timer = setTimeout(() => r('still running'), 30_000))
            ),
        ]);
        clearTimeout(timer);
        const all = `${stdout}\n${stderr}`;
        assert.equal(code, 1, all);
        assert.doesNotMatch(stderr, /Unhandled 'error' event/);
        const lines = all
            .split('\n')
            .filter((l) => l.startsWith('{'))
            .map((l) => JSON.parse(l) as Row);
        const lost = lines.find((e) => e.msg === 'background_leader_lost');
        assert.equal(lost?.reason, 'connection_error');
        const stop = lines.find((e) => e.msg === 'shutdown_signal_received');
        assert.equal(stop?.signal, 'background_leader_lost:connection_error');
        assert.ok(
            lines.some((e) => e.msg === 'runtime_store_drained'),
            'the store was drained before the exit'
        );
    }
);

test(
    'a write-behind write whose backend is terminated under its query lands on the retry',
    { skip },
    async (t) => {
        const lines = captureWarnings(t);
        const database = await newDatabase();
        const pool = await sharedPool(database);
        t.after(() => pool.end());
        const a = await admin(urlFor(database));
        t.after(() => a.end());
        await a.query('CREATE TABLE probe_wb (id text PRIMARY KEY, v text)');
        const columns = await (async () => {
            const c = await pool.connect();
            try {
                return await introspectColumns(c as never, 'probe_wb');
            } finally {
                c.release();
            }
        })();
        const plan = {
            descriptor: {
                mapName: 'probe',
                tableName: 'probe_wb',
                keyOf: (r: Record<string, unknown>) => String(r.id),
                conflictColumns: ['id'],
            },
            columns,
            columnNames: new Set(columns.map((c) => c.name)),
        };
        const queue = new WriteBehindQueue(
            pool as never,
            new Map([['probe', plan]]) as never,
            () => undefined
        );

        // Hold the write in flight on a lock, terminate only its backend, then
        // let go: Postgres stays reachable throughout.
        const locker = await admin(urlFor(database));
        t.after(() => locker.end());
        await locker.query('BEGIN');
        await locker.query('LOCK TABLE probe_wb IN ACCESS EXCLUSIVE MODE');
        queue.enqueueUpsert('probe', { id: 'a', v: 'written' });
        let blocked: number[] = [];
        const deadline = Date.now() + 5_000;
        while (blocked.length === 0 && Date.now() < deadline) {
            const { rows } = await a.query(
                `SELECT pid FROM pg_stat_activity WHERE datname = current_database()
                  AND wait_event_type = 'Lock' AND query ILIKE 'INSERT INTO probe_wb%'`
            );
            blocked = rows.map((r) => r.pid as number);
            if (blocked.length === 0) await sleep(20);
        }
        assert.equal(blocked.length, 1, 'the write blocked on the lock');
        assert.deepEqual(await terminate(database, 'pid = $1', [blocked[0]]), blocked);
        await sleep(50);
        await locker.query('ROLLBACK');
        await queue.drain();

        assert.deepEqual(logged(lines, 'db_write_behind_failed'), [], 'the write was not dropped');
        assert.equal(logged(lines, 'db_write_behind_retry').length, 1);
        const { rows } = await a.query('SELECT id, v FROM probe_wb');
        assert.deepEqual(rows, [{ id: 'a', v: 'written' }]);
    }
);

test(
    'a reconnect whose LISTEN backend is terminated under it gives the dead client back to the pool',
    { skip, timeout: 60_000 },
    async (t) => {
        captureWarnings(t);
        const database = await newDatabase();
        const target = new URL(urlFor(database));
        // A proxy that holds the reconnect's LISTEN back from the server, so the
        // backend can be terminated while LISTEN is in flight on the client: the
        // server's FATAL then reaches pg with LISTEN as its active query, and
        // the socket closes after it, as with a terminate that lands mid-LISTEN.
        let listens = 0;
        let held: () => void = () => undefined;
        const listenHeld = new Promise<void>((r) => (held = r));
        const proxy = net.createServer((down) => {
            const up = net.connect(Number(target.port || 5432), target.hostname);
            up.on('data', (d) => down.write(d));
            down.on('data', (d) => {
                if (d.includes('LISTEN blackout_store_change') && ++listens === 2) {
                    held();
                    return;
                }
                up.write(d);
            });
            for (const [a, b] of [
                [down, up],
                [up, down],
            ]) {
                a.on('error', () => b.destroy());
                a.on('close', () => b.destroy());
            }
        });
        await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', () => r()));
        const via = new URL(target.toString());
        via.hostname = '127.0.0.1';
        via.port = String((proxy.address() as net.AddressInfo).port);
        clearSharedPgPool();
        process.env.DATABASE_URL = via.toString();
        const pool = (await getSharedPgPool()) as unknown as SharedPool;
        const transport = new PgNotifyTransport(pool as never);
        t.after(async () => {
            await transport.close();
            let timer: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([pool.end(), new Promise((r) => (timer = setTimeout(r, 3_000)))]);
            clearTimeout(timer);
            await new Promise<void>((r) => proxy.close(() => r()));
        });
        let reconnects = 0;
        transport.onReconnect(() => (reconnects += 1));
        await transport.subscribe(() => undefined);

        // Drop the LISTEN connection; the transport reconnects after 2 s, and the
        // proxy holds that reconnect's LISTEN.
        assert.equal((await terminate(database, `query ILIKE 'LISTEN%'`)).length, 1);
        await listenHeld;
        const newest = await terminate(
            database,
            `backend_type = 'client backend' AND backend_start =
               (SELECT max(backend_start) FROM pg_stat_activity
                 WHERE datname = current_database() AND pid <> pg_backend_pid())`
        );
        assert.equal(newest.length, 1, 'the reconnect backend was terminated under its LISTEN');

        // The failed reconnect is retried 2 s later and succeeds.
        await waitFor(() => reconnects > 0, 'the LISTEN reconnect', 10_000);
        await sleep(500);
        assert.equal(reconnects, 1);
        assert.equal(listens, 3, 'one retry after the failed reconnect');
        const a = await admin(urlFor(database));
        const { rows } = await a.query(
            `SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE datname = current_database() AND query ILIKE 'LISTEN%'`
        );
        await a.end();
        assert.equal(rows[0].n, 1, 'one LISTEN session');
        assert.equal(pool.totalCount, 1, 'the dead reconnect client no longer holds a pool slot');
    }
);

test(
    'a peer change or a re-hydrate that Postgres refuses a connection for does not end the process, and the re-hydrate is retried',
    { skip, timeout: 60_000 },
    async (t) => {
        const rejections = captureUnhandledRejections(t);
        const lines = captureWarnings(t);
        const database = await newDatabase();
        const pool = await sharedPool(database);
        t.after(() => pool.end());
        await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });

        // The replica under test: peer changes and reconnects are delivered by
        // hand, as its LISTEN connection would.
        type Payload = { src: string; m: string; op: 'u' | 'r'; kv?: string[] };
        const transport = {
            peer: (_payload: Payload): void => undefined,
            reconnect: (): void => undefined,
            publish: (): void => undefined,
            async subscribe(handler: (payload: Payload) => void) {
                transport.peer = handler;
            },
            onReconnect(handler: () => void) {
                transport.reconnect = handler;
            },
            async close() {},
        };
        const replica = new PostgresBackedDb();
        await replica.init(pool as never, transport as never);
        t.after(() => replica.shutdown());
        // A user written by another replica that this one never heard about.
        const writer = new PostgresBackedDb();
        await writer.init(pool as never);
        const id = randomUUID();
        writer.createUser({
            id,
            username: `missed${id.slice(0, 8)}`,
            email: `${id.slice(0, 8)}@example.test`,
            passwordHash: 'hash',
            reputationScore: 1,
            reputationTier: 'member',
            pubkeyEd25519: 'pk',
        });
        await writer.drain();
        assert.deepEqual(logged(lines, 'db_write_behind_failed'), []);
        assert.equal(replica.getUserById(id), undefined);

        // Postgres stops taking connections to this database, and the replica's
        // pooled ones are gone, so each of these needs a new one.
        const a = await admin();
        t.after(async () => {
            await a.query(`ALTER DATABASE ${database} ALLOW_CONNECTIONS true`);
            await a.end();
        });
        await a.query(`ALTER DATABASE ${database} ALLOW_CONNECTIONS false`);
        await a.query(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
              WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [database]
        );
        await waitFor(() => pool.totalCount === 0, 'the pool to drop its connections');

        transport.peer({ src: 'peer-replica', m: 'users', op: 'r' });
        transport.reconnect();
        await waitFor(
            () =>
                logged(lines, 'pg_store_peer_refresh_failed').length > 0 &&
                logged(lines, 'pg_store_rehydrate_failed').length > 0,
            'both failures to be logged'
        );
        await sleep(100);
        assert.deepEqual(rejections, [], 'no unhandled rejection');
        assert.match(
            String(logged(lines, 'pg_store_peer_refresh_failed')[0].error),
            /not currently accepting connections/
        );
        assert.equal(logged(lines, 'pg_store_rehydrate_failed')[0].retryInMs, REHYDRATE_RETRY_MS);

        await a.query(`ALTER DATABASE ${database} ALLOW_CONNECTIONS true`);
        await waitFor(
            () => replica.getUserById(id) !== undefined,
            'the retried re-hydrate to load the missed user',
            REHYDRATE_RETRY_MS + 5_000
        );
        assert.equal(logged(lines, 'pg_store_rehydrate_failed').length, 1);
        assert.deepEqual(rejections, []);
    }
);
