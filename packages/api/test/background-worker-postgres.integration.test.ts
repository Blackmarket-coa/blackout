/**
 * The background worker on the postgres runtime store, against a real
 * Postgres engine (in-process PGlite): what is in the database is what its
 * loops act on.
 *
 * In deploy/docker/production the worker once started its loops without
 * loading the store, so every loop ran against an empty in-process store and
 * nothing it was there for happened. Here an overdue scheduled message and a
 * lapsed dead-man switch exist in Postgres before the worker boots and nowhere
 * else. The test passes only if the boot loaded them before any loop started,
 * the loops applied the backlog rules to them, and the shutdown flushed the
 * result to Postgres before it let go of the lock.
 *
 * The boot is the production one (bootPostgresRuntimeStore through the shared
 * pool, here a shim over PGlite). The lock is the real advisory lock, taken and
 * released on PGlite; only the watch is a stand-in, because PGlite runs in
 * single-user mode and reports no backend pid, so the held-lock check would
 * always say "not held". Contention between two workers needs a real server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'postgres';
// One-second ticks rather than the 30-second defaults. The backlog tolerance
// stays at its 15-minute floor (ten seconds is less).
process.env.BLACKOUT_SCHEDULED_MESSAGES_DISPATCH_INTERVAL_SECONDS = '1';
process.env.BLACKOUT_DEADMAN_SWEEP_INTERVAL_SECONDS = '1';

const { createBackgroundWorker } = await import('../src/backgroundWorker');
const { setSharedPgPoolForTests } = await import('../src/config/postgres');
const { db } = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { releaseBackgroundLeader, tryBecomeBackgroundLeader } = await import(
    '../src/services/backgroundLeader'
);
const { isScheduledMessageDispatcherRunning } = await import(
    '../src/services/scheduledMessageDispatcher'
);
const { isDeadmanSweepSchedulerRunning } = await import('../src/services/deadmanSweepScheduler');
const { PGlite } = await import('@electric-sql/pglite');

type AnyPg = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<Array<{ rows?: unknown[] }>>;
    close?: () => Promise<void>;
};

const WRITE_DELAY_MS = 400;

/**
 * A pg pool over PGlite. Parameterless SQL goes to exec() (PGlite's query()
 * rejects multi-statement migrations). Writes to the two tables under test are
 * slowed, so a shutdown that does not wait for the flush is caught; and the
 * hydration of deadman_switches can be held, to look at the worker mid-boot.
 */
function shimPool(pg: AnyPg) {
    let hydrationHeld: Promise<void> | null = null;
    let releaseHydration: () => void = () => {};
    let onHydration: () => void = () => {};
    const run = async (sql: string, params?: unknown[]) => {
        if (!Array.isArray(params) || params.length === 0) {
            const results = await pg.exec(sql);
            return { rows: results.at(-1)?.rows ?? [] };
        }
        const result = await pg.query(sql, params);
        return { rows: result.rows };
    };
    const client = {
        async query(sql: string, params?: unknown[]) {
            if (/^INSERT INTO (scheduled_messages|deadman_switches) /.test(sql)) {
                await new Promise((resolve) => setTimeout(resolve, WRITE_DELAY_MS));
            }
            if (sql === 'SELECT * FROM deadman_switches' && hydrationHeld) {
                onHydration();
                await hydrationHeld;
            }
            return run(sql, params);
        },
        release: () => {},
        on: () => {},
        removeListener: () => {},
    };
    return {
        pool: { connect: async () => client, end: async () => {} },
        holdHydration(reached: () => void) {
            onHydration = reached;
            hydrationHeld = new Promise<void>((resolve) => {
                releaseHydration = resolve;
            });
        },
        letHydrationGo() {
            releaseHydration();
            hydrationHeld = null;
        },
    };
}

const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

async function waitFor(condition: () => boolean, label: string, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) assert.fail(`timed out waiting for: ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

test('the worker loads the store before any loop, its loops act on what Postgres held, and its shutdown flushes before releasing the lock', async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const shim = shimPool(pg);
    try {
        await migrateUp({ pool: shim.pool as never, migrationsDir: MIGRATIONS_DIR });
        const now = Date.now();
        const messageId = randomUUID();
        const switchId = randomUUID();
        // Written straight to Postgres, as an app replica would have written
        // them while no loop ran.
        await pg.query(
            `INSERT INTO scheduled_messages
               (id, user_id, matrix_room_id, body, formatted_body, deliver_at, status, attempts, created_at)
             VALUES ($1, 'author', '!room:test.local', 'good morning', '<b>good morning</b>', $2, 'pending', 0, $3)`,
            [messageId, iso(now - 2 * HOUR), iso(now - 3 * HOUR)]
        );
        await pg.query(
            `INSERT INTO deadman_switches
               (id, owner_id, room_id, status, check_in_interval_seconds, grace_period_seconds,
                last_check_in_at, trigger_at, release_at, recipients, encrypted_payload, created_at, updated_at)
             VALUES ($1, 'owner', '!room:test.local', 'armed', 60, 60, $2, $3, $4, '{recipient}', 'sealed', $2, $2)`,
            [
                switchId,
                iso(now - 2 * HOUR - 60_000),
                iso(now - 2 * HOUR),
                iso(now - 2 * HOUR + 60_000),
            ]
        );
        setSharedPgPoolForTests(shim.pool as never);

        const rowsInPostgres = async () => {
            const message = (
                await pg.query(
                    'SELECT status, last_error, body, formatted_body FROM scheduled_messages WHERE id = $1',
                    [messageId]
                )
            ).rows[0] as Record<string, unknown>;
            const deadman = (
                await pg.query(
                    'SELECT status, release_at, backlog_grace_started_at FROM deadman_switches WHERE id = $1',
                    [switchId]
                )
            ).rows[0] as Record<string, unknown>;
            return { message, deadman };
        };
        let atRelease: Awaited<ReturnType<typeof rowsInPostgres>> | undefined;
        const exits: number[] = [];
        const path = join(mkdtempSync(join(tmpdir(), 'blackout-worker-pg-')), 'heartbeat');
        const worker = createBackgroundWorker({
            heartbeatPath: path,
            exit: (code) => exits.push(code),
            leadership: {
                tryAcquire: tryBecomeBackgroundLeader,
                watch: () => () => undefined,
                release: async () => {
                    atRelease = await rowsInPostgres();
                    await releaseBackgroundLeader();
                },
            },
        });

        // Mid-boot: the store is still loading, so nothing may run yet.
        let reached = false;
        shim.holdHydration(() => {
            reached = true;
        });
        const started = worker.start();
        await waitFor(() => reached, 'the boot to reach the dead-man switches');
        assert.equal(worker.role(), 'starting');
        assert.equal(isScheduledMessageDispatcherRunning(), false, 'no loop before the store');
        assert.equal(isDeadmanSweepSchedulerRunning(), false, 'no loop before the store');
        assert.ok(!existsSync(path), 'not healthy before the store is loaded');
        shim.letHydrationGo();
        await started;
        assert.equal(worker.role(), 'leader');
        assert.ok(existsSync(path));
        assert.equal(db.getScheduledMessage(messageId)?.body, 'good morning', 'hydrated');

        // The loops act on what the store loaded.
        await waitFor(
            () =>
                db.getScheduledMessage(messageId)?.status === 'failed' &&
                Boolean(db.getDeadmanSwitch(switchId)?.backlogGraceStartedAt),
            'the dispatcher and the sweep to act'
        );
        const expired = db.getScheduledMessage(messageId);
        assert.equal(expired?.lastError, 'expired_overdue');
        assert.equal(expired?.body, '');
        const windowed = db.getDeadmanSwitch(switchId);
        assert.equal(windowed?.status, 'grace', 'not fired on the first sweep');
        assert.ok(Date.parse(windowed!.releaseAt) - Date.now() > 71 * HOUR, 'a 72-hour window');

        await worker.shutdown('SIGTERM');
        assert.deepEqual(exits, [0]);
        assert.ok(atRelease, 'the lock was released');
        // Already in Postgres when the lock went, although every write took
        // WRITE_DELAY_MS: the shutdown waited for the flush.
        assert.deepEqual(
            {
                status: atRelease.message.status,
                lastError: atRelease.message.last_error,
                body: atRelease.message.body,
                formattedBody: atRelease.message.formatted_body,
            },
            { status: 'failed', lastError: 'expired_overdue', body: '', formattedBody: null }
        );
        assert.equal(atRelease.deadman.status, 'grace');
        assert.ok(atRelease.deadman.backlog_grace_started_at instanceof Date);
        assert.equal(
            (atRelease.deadman.release_at as Date).toISOString(),
            windowed!.releaseAt,
            'the moved release reached Postgres'
        );
    } finally {
        await pg.close?.();
    }
});

test("the worker's boot audits migration checksums and refuses a drifted history in production", async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const shim = shimPool(pg);
    const saved = {
        NODE_ENV: process.env.NODE_ENV,
        LOG_HASH_SALT: process.env.LOG_HASH_SALT,
        BLACKOUT_DB_MIGRATE_ON_START: process.env.BLACKOUT_DB_MIGRATE_ON_START,
    };
    try {
        await migrateUp({ pool: shim.pool as never, migrationsDir: MIGRATIONS_DIR });
        // An applied migration whose file is gone, which migrateUp alone would not flag.
        await pg.query(
            'INSERT INTO schema_migrations (id, ordinal, checksum) VALUES ($1, $2, $3)',
            ['999_not_on_disk', 999, '0'.repeat(64)]
        );
        setSharedPgPoolForTests(shim.pool as never);
        process.env.NODE_ENV = 'production';
        process.env.LOG_HASH_SALT = 'test-salt';
        process.env.BLACKOUT_DB_MIGRATE_ON_START = '0';
        let attempts = 0;
        const worker = createBackgroundWorker({
            heartbeatPath: join(mkdtempSync(join(tmpdir(), 'blackout-worker-pg-')), 'heartbeat'),
            exit: () => {},
            leadership: {
                tryAcquire: async () => {
                    attempts += 1;
                    return true;
                },
                watch: () => () => undefined,
                release: async () => {},
            },
        });
        await assert.rejects(worker.start(), /applied but missing on disk: 999_not_on_disk/);
        assert.equal(attempts, 0, 'never tried for the lock');
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await pg.close?.();
    }
});
