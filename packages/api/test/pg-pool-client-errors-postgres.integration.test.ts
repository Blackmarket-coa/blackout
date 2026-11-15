// Pooled connections dropped by a real PostgreSQL server must not end the
// process. Needs a server: set BLACKOUT_TEST_PG_URL to one (a role that may
// create databases, alter the ones it owns and terminate backends); each test
// gets its own database. Without it these tests are skipped, and no CI workflow
// sets it yet (checked 2026-11-15), so they run only where someone points them
// at a server. pg-pool-client-errors.integration.test.ts runs everywhere: it
// runs the same source (the pool's listeners, the LISTEN transport, the
// write-behind queue's retry, the store's re-hydrate retry, the leader lock
// and its watch, src/inProcessBackgroundLoops.ts) against stand-in
// connections that fail in the orders pg 8.20.0 uses. What only this file
// checks:
//   - pg's own ordering of a real drop, and a real server's answer while it
//     takes no new connections;
//   - the API process itself (src/index.ts, spawned in postgres mode) against
//     a real server: staying up, stopping its loops and taking the lock again
//     when its leader-lock connection drops, and draining to exit 0 on SIGTERM
//     when the connection it held the lock on drops during the drain;
//   - a real server's idle_session_timeout: sparing the LISTEN connection,
//     which turns it off for itself, and the leader lock's, which raises one
//     too short for its lock checks; ending the pool's other idle ones; and
//     ending a lock session whose process is gone without the server seeing
//     it, at the raised timeout.
//
// A backend is dropped the ways production sees it: pg_terminate_backend (what
// a restart or a failover does to a session), the server's own
// idle_session_timeout, and a TCP reset from a proxy in front of the server (a
// network fault), on both sides or on the process's side only.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const PG_URL = process.env.BLACKOUT_TEST_PG_URL?.trim() || undefined;
const skip = PG_URL ? false : 'set BLACKOUT_TEST_PG_URL to run against PostgreSQL';

const { clearSharedPgPool, getSharedPgPool } = await import('../src/config/postgres');
const { PgNotifyTransport } = await import('../src/db/pgNotify');
const {
    BACKGROUND_LEADER_LOCK_KEY,
    acquireBackgroundLeaderLock,
    releaseBackgroundLeader,
    watchBackgroundLeadership,
} = await import('../src/services/backgroundLeader');
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
const sharedPool = async (database: string, url = urlFor(database)): Promise<SharedPool> => {
    clearSharedPgPool();
    process.env.DATABASE_URL = url;
    return (await getSharedPgPool()) as unknown as SharedPool;
};

/**
 * `url` with an idle_session_timeout for the sessions opened through it and
 * no others: a startup option, so no role's or database's default changes and
 * the admin sessions these tests open are not under it.
 */
const withIdleSessionTimeout = (url: string, timeout: string): string => {
    const u = new URL(url);
    u.searchParams.set('options', `-c idle_session_timeout=${timeout}`);
    return u.toString();
};

/**
 * A TCP proxy in front of the server at `target`. orphan() resets every
 * connection on the process's side and leaves the server's side open, so the
 * server is not told that its client is gone: what a firewall or NAT that
 * loses a connection's state does, or a host that goes away without closing.
 */
const orphaningProxy = async (target: URL) => {
    const pairs = new Set<{ down: net.Socket; up: net.Socket }>();
    const orphans: net.Socket[] = [];
    const server = net.createServer((down) => {
        const up = net.connect(Number(target.port || 5432), target.hostname);
        const pair = { down, up };
        pairs.add(pair);
        down.pipe(up);
        up.pipe(down);
        const done = () => {
            if (!pairs.delete(pair)) return;
            down.destroy();
            up.destroy();
        };
        for (const socket of [down, up]) {
            socket.on('error', done);
            socket.on('close', done);
        }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const via = new URL(target.toString());
    via.hostname = '127.0.0.1';
    via.port = String((server.address() as net.AddressInfo).port);
    return {
        url: via.toString(),
        /** Returns how many connections were orphaned. */
        orphan(): number {
            const open = [...pairs];
            for (const pair of open) {
                pairs.delete(pair);
                pair.down.unpipe(pair.up);
                pair.up.unpipe(pair.down);
                // What the server still sends is read and dropped.
                pair.up.resume();
                pair.down.resetAndDestroy();
                orphans.push(pair.up);
            }
            return open.length;
        },
        async close(): Promise<void> {
            for (const up of orphans) up.destroy();
            await new Promise<void>((r) => server.close(() => r()));
        },
    };
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

/**
 * End a pool in teardown without waiting forever. pool.end() waits for every
 * client still checked out, so a test that fails before it gives one back
 * would hang its teardown and cancel every test after it; what is left open is
 * closed when the test databases are dropped at the end.
 */
const endPool = async (pool: { end(): Promise<void> }): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([pool.end(), new Promise((r) => (timer = setTimeout(r, 3_000)))]);
    clearTimeout(timer);
};

/**
 * The API (src/index.ts) in postgres mode on `database`, running the
 * background loops in-process, as it does when
 * BLACKOUT_BACKGROUND_WORKERS_DISABLED is unset. Resolves once it listens and
 * its loops have started.
 */
const startApi = async (
    t: { after(fn: () => void): void },
    database: string,
    extraEnv: NodeJS.ProcessEnv = {}
) => {
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
        ...extraEnv,
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
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    });
    const out = { stdout: '', stderr: '' };
    child.stdout.on('data', (d) => (out.stdout += d));
    child.stderr.on('data', (d) => (out.stderr += d));
    const exited = new Promise<number | null>((r) => child.on('exit', (code) => r(code)));

    await waitFor(
        () =>
            (out.stdout.includes('"background_loops_started"') &&
                out.stdout.includes('"blackout-server listening"')) ||
            child.exitCode !== null,
        'the API to listen and start its loops',
        60_000
    ).catch((err: Error) => {
        // Say what the API did instead.
        throw new Error(`${err.message}:\n${out.stdout}\n${out.stderr}`);
    });
    assert.equal(child.exitCode, null, `the API exited early:\n${out.stdout}\n${out.stderr}`);

    /** The exit code, or 'still running' after `ms`. */
    const exitCode = async (ms: number): Promise<number | null | 'still running'> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const code = await Promise.race([
            exited,
            new Promise<'still running'>((r) => (timer = setTimeout(() => r('still running'), ms))),
        ]);
        clearTimeout(timer);
        return code;
    };
    const lines = (): Row[] =>
        `${out.stdout}\n${out.stderr}`
            .split('\n')
            .filter((l) => l.startsWith('{'))
            .map((l) => JSON.parse(l) as Row);
    return { child, port, out, exitCode, lines };
};

test(
    'a terminated idle connection is dropped and logged; the next checkout gets a new backend',
    { skip },
    async (t) => {
        const lines = captureWarnings(t);
        const database = await newDatabase();
        const pool = await sharedPool(database);
        t.after(() => endPool(pool));
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
        t.after(() => endPool(pool));
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
        await endPool(pool);
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
        // hangs.
        t.after(async () => {
            await transport.close();
            await endPool(pool);
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
    "the LISTEN connection and the leader-lock connection outlive an idle_session_timeout that ends the pool's other idle connections, and are under it again once given back",
    { skip, timeout: 60_000 },
    async (t) => {
        const lines = captureWarnings(t);
        const database = await newDatabase();
        const pool = await sharedPool(database, withIdleSessionTimeout(urlFor(database), '1s'));
        const transport = new PgNotifyTransport(pool as never);
        t.after(async () => {
            await transport.close();
            await releaseBackgroundLeader();
            await endPool(pool);
        });
        const a = await admin(urlFor(database));
        t.after(() => a.end());
        const connected = async (pids: number[]): Promise<number[]> =>
            (
                await a.query(
                    'SELECT pid FROM pg_stat_activity WHERE pid = ANY($1::int[]) ORDER BY pid',
                    [pids]
                )
            ).rows.map((r) => r.pid as number);
        /** Connections the server ended for sitting idle, as the pool logged them. */
        const endedIdle = (): Row[] =>
            logged(lines, 'pg_pool_client_error').filter((e) => e.code === '57P05');

        // The timeout is in force on this pool's sessions: the server ends an
        // ordinary connection left idle, and the pool drops it.
        const ordinary = await pool.connect();
        const ordinaryPid = await pidOf(ordinary);
        assert.equal(
            (await ordinary.query('SHOW idle_session_timeout')).rows[0].idle_session_timeout,
            '1s'
        );
        ordinary.release();
        await waitFor(() => endedIdle().length === 1, 'the server to end an idle connection');
        assert.equal(endedIdle()[0].state, 'idle');
        assert.deepEqual(await connected([ordinaryPid]), []);

        let reconnects = 0;
        transport.onReconnect(() => (reconnects += 1));
        await transport.subscribe(() => undefined);
        assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
        const lost: string[] = [];
        watchBackgroundLeadership((reason) => lost.push(reason));
        const held = (
            await a.query(
                `SELECT pid FROM pg_stat_activity
                  WHERE datname = current_database() AND query ILIKE 'LISTEN%'
                 UNION
                 SELECT pid FROM pg_locks
                  WHERE locktype = 'advisory' AND granted AND objid = $1::bigint::oid
                    AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
                 ORDER BY pid`,
                [BACKGROUND_LEADER_LOCK_KEY]
            )
        ).rows.map((r) => r.pid as number);
        assert.equal(held.length, 2, 'the LISTEN session and the lock session');

        // Four timeout periods. Nothing is sent on either meanwhile: LISTEN is
        // the last statement on one, which has turned the timeout off for
        // itself; the other raised it to 30 s when the watch began, and its
        // first lock check is 10 s away.
        await sleep(4_000);
        assert.deepEqual(await connected(held), held, 'both sessions are still connected');
        const idle = await a.query(
            `SELECT pid FROM pg_stat_activity
              WHERE pid = ANY($1::int[]) AND state = 'idle'
                AND now() - state_change > interval '3 seconds'`,
            [held]
        );
        assert.equal(idle.rows.length, 2, 'and sat idle for more than three periods');
        assert.equal(reconnects, 0, 'no LISTEN reconnect, so no re-hydrate');
        assert.deepEqual(logged(lines, 'pg_notify_listen_error'), []);
        assert.deepEqual(lost, [], 'the lock was not lost');
        assert.equal(endedIdle().length, 1, 'no connection but the ordinary one was ended');

        // Given back, each is an ordinary pooled connection, under the timeout
        // again: the server ends both.
        await transport.close();
        await releaseBackgroundLeader();
        await waitFor(() => endedIdle().length === 3, 'the server to end both once pooled');
        assert.deepEqual(
            endedIdle().map((e) => e.state),
            ['idle', 'idle', 'idle']
        );
        assert.deepEqual(await connected(held), []);
    }
);

test(
    "a network reset while the leader-lock connection's idle-session read is out is reported by the watch at once, not at the next lock check",
    { skip },
    async (t) => {
        const lines = captureWarnings(t);
        const database = await newDatabase();
        const target = new URL(urlFor(database));
        // A proxy that resets the connection the read of the idle-session
        // timeout comes down, instead of passing the statement on. Only the
        // lock's connection sends it here.
        let resets = 0;
        const proxy = net.createServer((down) => {
            const up = net.connect(Number(target.port || 5432), target.hostname);
            up.on('data', (d) => down.write(d));
            down.on('data', (d) => {
                if (d.includes("FROM pg_settings WHERE name = 'idle_session_timeout'")) {
                    resets += 1;
                    down.resetAndDestroy();
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
        const pool = await sharedPool(database, via.toString());
        t.after(async () => {
            await releaseBackgroundLeader();
            await endPool(pool);
            await new Promise<void>((r) => proxy.close(() => r()));
        });

        // The lock is taken, and reported taken with nothing about the timeout
        // sent or waited for; its caller watches it from that moment, as the
        // API and the worker do, and the watch sends the read once it listens.
        assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
        const lost: string[] = [];
        watchBackgroundLeadership((reason) => lost.push(reason));
        // pg reports the reset on the client before it fails the statement in
        // flight. Waited for before the lock was reported taken, the statement
        // kept the watch off the connection until after that report, and the
        // process believed it held a lock it had lost until the first lock
        // check, 10 s later.
        await waitFor(() => lost.length === 1, 'the watch to report the loss', 3_000);
        assert.equal(resets, 1);
        assert.deepEqual(lost, ['connection_error']);
        // Reported once, when the socket closes: pg 8.20.0 passes over the
        // socket's ECONNRESET on a connection that has sent a parameterized
        // statement, as the lock statement is.
        const drops = logged(lines, 'pg_pool_client_error');
        assert.equal(drops.length, 1, 'one drop, logged once');
        assert.equal(drops[0].state, 'held');
        assert.equal(drops[0].error, 'Connection terminated unexpectedly');
        assert.equal(pool.totalCount, 0, 'the dead connection was destroyed');

        // The server gives the lock up with the session; another connection
        // can take it.
        const a = await admin(urlFor(database));
        t.after(() => a.end());
        const deadline = Date.now() + 5_000;
        let free = false;
        while (!free && Date.now() < deadline) {
            const { rows } = await a.query(
                `SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted
                   AND objid = $1::bigint::oid
                   AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
                [BACKGROUND_LEADER_LOCK_KEY]
            );
            free = rows.length === 0;
            if (!free) await sleep(20);
        }
        assert.ok(free, 'nobody holds the lock in Postgres');
    }
);

test(
    'a leader-lock session under an idle_session_timeout shorter than its lock checks is kept while its process is there; once the process is gone without the server seeing it, the server ends the session at the raised timeout and the lock is free',
    { skip, timeout: 60_000 },
    async (t) => {
        captureWarnings(t);
        const database = await newDatabase();
        const proxy = await orphaningProxy(new URL(urlFor(database)));
        // Half a second, with a lock check every second: left alone, the
        // server ends the session between two checks. Three check intervals
        // make the floor 3 s.
        const pool = await sharedPool(database, withIdleSessionTimeout(proxy.url, '500ms'));
        t.after(async () => {
            await releaseBackgroundLeader();
            await endPool(pool);
            await proxy.close();
        });
        const a = await admin(urlFor(database));
        t.after(() => a.end());
        const holders = async (): Promise<number[]> =>
            (
                await a.query(
                    `SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND granted
                       AND objid = $1::bigint::oid
                       AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
                    [BACKGROUND_LEADER_LOCK_KEY]
                )
            ).rows.map((r) => r.pid as number);

        assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
        const lost: string[] = [];
        watchBackgroundLeadership((reason) => lost.push(reason), { checkIntervalMs: 1_000 });
        const [holder] = await holders();
        assert.ok(holder, 'a session holds the lock');

        // Twelve of the server's timeout periods.
        await sleep(6_000);
        assert.deepEqual(lost, [], 'the lock was not lost while its process was there');
        assert.deepEqual(await holders(), [holder], 'the same session still holds it');

        // The process's side of the connection is reset. The server's side
        // stays open, and the server is told nothing.
        const orphanedAt = Date.now();
        assert.ok(proxy.orphan() >= 1);
        await waitFor(() => lost.length === 1, 'the watch to report the loss', 3_000);
        assert.deepEqual(await holders(), [holder], 'the server still has the session');

        // Nothing is sent on that session any more. The server ends it when
        // the raised timeout runs out, 3 s after its last lock check (which
        // came up to 1 s before the reset), and the lock goes with it. Exempt
        // from the timeout, it would have kept the lock until the server's
        // TCP keepalive gave up.
        let freeAfterMs = -1;
        while (freeAfterMs < 0) {
            if (Date.now() - orphanedAt > 8_000) {
                throw new Error('timed out waiting for the server to end the orphaned session');
            }
            await sleep(50);
            if ((await holders()).length === 0) freeAfterMs = Date.now() - orphanedAt;
        }
        assert.ok(freeAfterMs >= 1_500, `the server saw its client go (${freeAfterMs} ms)`);
        assert.equal(
            (await a.query('SELECT 1 FROM pg_stat_activity WHERE pid = $1', [holder])).rows.length,
            0,
            'the orphaned session is gone'
        );

        // A process can take the lock again: here this one, on a new connection.
        assert.equal(await acquireBackgroundLeaderLock(pool as never), true);
        const after = await holders();
        assert.equal(after.length, 1);
        assert.notEqual(after[0], holder);
    }
);

test(
    'an API running the loops in-process stays up when the leader lock connection drops, stops its loops and takes the lock again',
    { skip, timeout: 120_000 },
    async (t) => {
        const database = await newDatabase();
        // The auth-rows prune is one of the loops. Every pass deletes the rows
        // Postgres finds expired, so with a pass every second an expired row
        // put there shows whether the loops are running.
        const api = await startApi(t, database, {
            BLACKOUT_AUTH_ROWS_PRUNE_INTERVAL_SECONDS: '1',
        });
        const a = await admin(urlFor(database));
        t.after(() => a.end());
        const plantExpiredRow = async (): Promise<string> => {
            const stateHash = randomBytes(32).toString('hex');
            await a.query(
                `INSERT INTO pending_oidc_logins
                   (state_hash, code_verifier_ciphertext, nonce_hash, redirect_uri,
                    encryption_key_id, expires_at)
                 VALUES ($1, 'x', $1, 'https://example.invalid/callback', 'k',
                         now() - interval '1 hour')`,
                [stateHash]
            );
            return stateHash;
        };
        const isThere = async (stateHash: string): Promise<boolean> =>
            (await a.query('SELECT 1 FROM pending_oidc_logins WHERE state_hash = $1', [stateHash]))
                .rows.length === 1;
        const untilPruned = async (stateHash: string, label: string): Promise<void> => {
            const deadline = Date.now() + 10_000;
            while (await isThere(stateHash)) {
                if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
                await sleep(100);
            }
        };
        const loopStarts = (): number =>
            api.lines().filter((e) => e.msg === 'background_loops_started').length;
        const holders = async (): Promise<number[]> =>
            (
                await a.query(
                    `SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND granted
                       AND objid = $1::bigint::oid
                       AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
                    [BACKGROUND_LEADER_LOCK_KEY]
                )
            ).rows.map((r) => r.pid as number);

        await untilPruned(await plantExpiredRow(), 'the running loops to prune an expired row');

        const before = await holders();
        assert.equal(before.length, 1, 'the leader lock was held on one connection');
        assert.deepEqual(await terminate(database, 'pid = $1', before), before);

        await waitFor(
            () =>
                api.lines().some((e) => e.msg === 'background_loops_stopped_leader_lost') ||
                api.child.exitCode !== null,
            'the loops to stop'
        );
        // Stopped: five prune intervals later an expired row is still there.
        // (The API tries for the lock again only 15 s after the loss.)
        const leftAlone = await plantExpiredRow();
        await sleep(5_000);
        const stillThere = await isThere(leftAlone);
        assert.equal(loopStarts(), 1, 'the loops have not been started again yet');
        assert.equal(stillThere, true, 'no prune pass ran while the lock was lost');

        // The retry comes every 15 s (the worker's standby interval).
        let after: number[] = [];
        const deadline = Date.now() + 40_000;
        while (after.length === 0 && api.child.exitCode === null && Date.now() < deadline) {
            await sleep(250);
            after = await holders();
        }
        assert.equal(api.child.exitCode, null, `${api.out.stdout}\n${api.out.stderr}`);
        assert.equal(after.length, 1, 'the API took the lock again');
        assert.notEqual(after[0], before[0], 'on a new connection');
        await waitFor(() => loopStarts() === 2, 'the loops to start again');
        await untilPruned(leftAlone, 'the loops that started again to prune the row');

        const health = await fetch(`http://127.0.0.1:${api.port}/health`);
        await health.arrayBuffer();
        assert.equal(health.status, 200, 'the API still serves');
        assert.doesNotMatch(api.out.stderr, /Unhandled 'error' event/);
        const lines = api.lines();
        assert.equal(
            lines.find((e) => e.msg === 'background_leader_lost')?.reason,
            'connection_error'
        );
        assert.equal(lines.filter((e) => e.msg === 'background_leader_acquired').length, 2);
        assert.deepEqual(
            lines.filter((e) => e.msg === 'shutdown_signal_received'),
            [],
            'no shutdown'
        );
    }
);

test(
    'an API running the loops in-process drains on SIGTERM to exit 0 when its former leader connection drops during the drain, and the queued sign-ups land',
    { skip, timeout: 120_000 },
    async (t) => {
        const database = await newDatabase();
        const api = await startApi(t, database, { SHUTDOWN_TIMEOUT_MS: '30000' });
        const a = await admin(urlFor(database));
        t.after(() => a.end());
        let signUps = 0;
        const signUp = async (username: string): Promise<number> => {
            const n = ++signUps;
            const res = await fetch(`http://127.0.0.1:${api.port}/v1/auth/register`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-forwarded-for': `10.77.0.${n}`,
                },
                body: JSON.stringify({
                    username,
                    email: `${username}@example.invalid`,
                    password: `Correct-horse-battery-${n}!`,
                }),
            });
            await res.arrayBuffer();
            return res.status;
        };
        const tag = randomUUID().slice(0, 8);
        const usernames = [`drainfirst${tag}`, `drainsecond${tag}`];

        // Hold the drain open: with users locked, the first sign-up's INSERT
        // waits on the server and the second waits behind it in the
        // write-behind queue.
        const locker = await admin(urlFor(database));
        t.after(() => locker.end());
        await locker.query('BEGIN');
        await locker.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
        for (const username of usernames) assert.equal(await signUp(username), 201);
        let blocked = 0;
        const deadline = Date.now() + 5_000;
        while (blocked === 0 && Date.now() < deadline) {
            const { rows } = await a.query(
                `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()
                  AND wait_event_type = 'Lock' AND query ILIKE 'INSERT INTO users%'`
            );
            blocked = rows[0].n as number;
            if (blocked === 0) await sleep(20);
        }
        assert.equal(blocked, 1, 'the first sign-up is written and blocked on the lock');
        const leader = await a.query(
            `SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND objid = $1::bigint::oid
               AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
            [BACKGROUND_LEADER_LOCK_KEY]
        );
        assert.equal(leader.rows.length, 1, 'the API holds the leader lock');
        const former = [leader.rows[0].pid as number];

        // SIGTERM gives the leader lock up and puts that connection back in the
        // pool while the drain waits; then that idle connection drops.
        api.child.kill('SIGTERM');
        let idle = false;
        const released = Date.now() + 10_000;
        while (!idle && Date.now() < released) {
            const { rows } = await a.query(
                `SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND state = 'idle'
                   AND NOT EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND locktype = 'advisory')`,
                former
            );
            idle = rows.length === 1;
            if (!idle) await sleep(20);
        }
        assert.ok(idle, 'the former leader connection is unlocked and idle in the pool');
        assert.deepEqual(await terminate(database, 'pid = $1', former), former);
        await waitFor(
            () =>
                api.lines().some((e) => e.msg === 'pg_pool_client_error') ||
                api.child.exitCode !== null,
            'the dropped idle connection to be logged'
        );
        await sleep(300);
        assert.equal(
            api.child.exitCode,
            null,
            `the API ended before its drain finished:\n${api.out.stdout}\n${api.out.stderr}`
        );

        await locker.query('ROLLBACK');
        const code = await api.exitCode(30_000);
        assert.equal(code, 0, `${api.out.stdout}\n${api.out.stderr}`);
        assert.doesNotMatch(api.out.stderr, /already been released|Unhandled 'error' event/);
        const lines = api.lines();
        assert.equal(lines.find((e) => e.msg === 'pg_pool_client_error')?.state, 'idle');
        assert.ok(
            lines.some((e) => e.msg === 'runtime_store_drained'),
            'the store was drained before the exit'
        );
        assert.deepEqual(
            lines.filter((e) => e.msg === 'db_write_behind_failed'),
            [],
            'no write was dropped'
        );
        const { rows } = await a.query(
            'SELECT username FROM users WHERE username = ANY($1::text[]) ORDER BY username',
            [usernames]
        );
        assert.deepEqual(
            rows.map((r) => r.username),
            [...usernames].sort()
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
        t.after(() => endPool(pool));
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
        const queue = new WriteBehindQueue(pool as never, new Map([['probe', plan]]) as never);

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
    'a targeted write whose backend is terminated under its COMMIT lands on the retry',
    { skip },
    async (t) => {
        const lines = captureWarnings(t);
        const database = await newDatabase();
        const pool = await sharedPool(database);
        t.after(() => endPool(pool));
        const a = await admin(urlFor(database));
        t.after(() => a.end());
        // A deferred constraint trigger that takes an advisory lock: a COMMIT
        // that deleted a row waits while the test holds that lock.
        await a.query('CREATE TABLE probe_wb (id text PRIMARY KEY, v text)');
        await a.query(`INSERT INTO probe_wb VALUES ('a', 'old'), ('b', 'old')`);
        await a.query(
            `CREATE FUNCTION probe_wait() RETURNS trigger LANGUAGE plpgsql AS
               $$ BEGIN PERFORM pg_advisory_xact_lock(4242); RETURN NULL; END $$`
        );
        await a.query(
            `CREATE CONSTRAINT TRIGGER probe_wait AFTER DELETE ON probe_wb
               DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION probe_wait()`
        );
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
        const queue = new WriteBehindQueue(pool as never, new Map([['probe', plan]]) as never);

        // Hold the op's COMMIT on the lock, terminate only its backend, then let
        // go: Postgres stays reachable throughout.
        const locker = await admin(urlFor(database));
        t.after(() => locker.end());
        await locker.query('SELECT pg_advisory_lock(4242)');
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
        let blocked: number[] = [];
        const deadline = Date.now() + 5_000;
        while (blocked.length === 0 && Date.now() < deadline) {
            const { rows } = await a.query(
                `SELECT pid FROM pg_stat_activity WHERE datname = current_database()
                  AND wait_event_type = 'Lock' AND query = 'COMMIT'`
            );
            blocked = rows.map((r) => r.pid as number);
            if (blocked.length === 0) await sleep(20);
        }
        assert.equal(blocked.length, 1, 'the COMMIT blocked on the lock');
        assert.deepEqual(await terminate(database, 'pid = $1', [blocked[0]]), blocked);
        await sleep(50);
        await locker.query('SELECT pg_advisory_unlock(4242)');
        await queue.drain();

        assert.deepEqual(logged(lines, 'db_write_behind_failed'), [], 'the write was not dropped');
        assert.equal(logged(lines, 'db_write_behind_retry').length, 1);
        const { rows } = await a.query('SELECT id FROM probe_wb ORDER BY id');
        assert.deepEqual(rows, [{ id: 'b' }]);
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
            await endPool(pool);
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
        t.after(() => endPool(pool));
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
