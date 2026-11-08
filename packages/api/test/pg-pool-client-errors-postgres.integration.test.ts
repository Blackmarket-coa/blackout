// Pooled connections dropped by a real PostgreSQL server must not end the
// process. Needs a server: set BLACKOUT_TEST_PG_URL to one (a role that may
// create databases and terminate backends); each test gets its own database.
// Without it these tests are skipped; pg-pool-client-errors.integration.test.ts
// covers the same paths with stand-in connections and runs everywhere.
//
// A backend is dropped the ways production sees it: pg_terminate_backend (what
// a restart, a failover or idle_session_timeout does to a session) and a TCP
// reset from a proxy in front of the server (a network fault).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

/** console.warn lines while the test runs. */
const captureWarnings = (t: { after(fn: () => void): void }): string[] => {
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (line: unknown) => lines.push(String(line));
    t.after(() => {
        console.warn = original;
    });
    return lines;
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
