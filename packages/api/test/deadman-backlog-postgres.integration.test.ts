/**
 * A dead-man switch's backlog grace window must survive a restart, or the
 * sweep could give the same missed check-in a second one; and a check-in must
 * clear it in Postgres, not only in the mirror. The Postgres-backed store
 * writes only fields that have a column, so these run PostgresBackedDb
 * against an in-process PGlite with every migration applied and read the
 * switch back after a simulated restart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.BLACKOUT_DB_MODE = 'memory';

const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { applyCheckIn, evaluateSweepTransition } = await import('../src/services/deadmanScheduler');
const { BACKLOG_TOLERANCE_FLOOR_MS } = await import('../src/services/backlogTolerance');
const { PGlite } = await import('@electric-sql/pglite');

type AnyPg = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<Array<{ rows?: unknown[] }>>;
    close?: () => Promise<void>;
};

// PGlite's query() rejects multi-statement SQL; route parameterless SQL to exec().
function poolFor(pg: AnyPg) {
    const client = {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
            if (!Array.isArray(params) || params.length === 0) {
                const results = await pg.exec(sql);
                return { rows: (results.at(-1)?.rows ?? []) as T[] };
            }
            const result = await pg.query(sql, params);
            return { rows: result.rows as T[] };
        },
        release: () => {},
    };
    return { connect: async () => client, end: async () => {} };
}

const columnOf = async (pg: AnyPg, id: string): Promise<unknown> => {
    const res = await pg.query(
        'SELECT backlog_grace_started_at FROM deadman_switches WHERE id = $1',
        [id]
    );
    assert.equal(res.rows.length, 1, `switch ${id} exists`);
    return (res.rows[0] as { backlog_grace_started_at: unknown }).backlog_grace_started_at;
};

test('a backlog window survives a restart, and a check-in clears it in Postgres too', async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const pool = poolFor(pg);
    try {
        await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
        const store = new PostgresBackedDb();
        await store.init(pool as never);
        const id = randomUUID();
        const armed = store.createDeadmanSwitch({
            id,
            ownerId: 'owner',
            roomId: '!room:test.local',
            status: 'armed',
            checkInIntervalSeconds: 60,
            gracePeriodSeconds: 60,
            lastCheckInAt: '2026-01-01T00:00:00.000Z',
            triggerAt: '2026-01-01T00:01:00.000Z',
            releaseAt: '2026-01-01T00:02:00.000Z',
            recipients: ['recipient'],
            encryptedPayload: 'sealed',
        });

        // What the sweep writes when it reaches the switch two hours late.
        const sweptAt = new Date('2026-01-01T02:00:00.000Z');
        const windowed = evaluateSweepTransition(armed, sweptAt, BACKLOG_TOLERANCE_FLOOR_MS);
        assert.equal(windowed.kind, 'backlog_grace');
        store.updateDeadmanSwitch(id, {
            status: windowed.record.status,
            releaseAt: windowed.record.releaseAt,
            backlogGraceStartedAt: windowed.record.backlogGraceStartedAt,
        });
        await store.drain();
        const written = await columnOf(pg, id);
        assert.ok(written instanceof Date, 'the column holds the moment the window opened');
        assert.equal((written as Date).toISOString(), sweptAt.toISOString());

        const restarted = new PostgresBackedDb();
        await restarted.init(pool as never);
        const hydrated = restarted.getDeadmanSwitch(id);
        assert.equal(hydrated?.status, 'grace');
        assert.equal(hydrated?.backlogGraceStartedAt, sweptAt.toISOString());
        assert.equal(hydrated?.releaseAt, '2026-01-04T02:00:00.000Z');
        // So a sweep after the restart does not open a second window.
        const later = new Date('2026-01-05T00:00:00.000Z');
        assert.equal(
            evaluateSweepTransition(hydrated!, later, BACKLOG_TOLERANCE_FLOOR_MS).kind,
            'triggered'
        );

        // What the check-in route writes.
        const refreshed = applyCheckIn(hydrated!, new Date('2026-01-02T00:00:00.000Z'));
        restarted.updateDeadmanSwitch(id, {
            status: refreshed.status,
            lastCheckInAt: refreshed.lastCheckInAt,
            triggerAt: refreshed.triggerAt,
            releaseAt: refreshed.releaseAt,
            backlogGraceStartedAt: refreshed.backlogGraceStartedAt,
        });
        await restarted.drain();
        assert.equal(await columnOf(pg, id), null, 'the check-in cleared the column');

        const again = new PostgresBackedDb();
        await again.init(pool as never);
        assert.equal(again.getDeadmanSwitch(id)?.status, 'armed');
        assert.equal(again.getDeadmanSwitch(id)?.backlogGraceStartedAt, undefined);
    } finally {
        await pg.close?.();
    }
});
