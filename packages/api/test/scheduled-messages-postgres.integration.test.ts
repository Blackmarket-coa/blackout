/**
 * Scheduled-message text and author links must leave Postgres too, not only
 * the in-memory mirror. The store writes Postgres through MUTATOR_SPECS: a
 * mutator without a spec line, or a record that drops a field instead of
 * clearing it, passes every memory-mode test while the old text stays in the
 * database. These run PostgresBackedDb against an in-process PGlite and read
 * the rows back after a simulated restart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
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
    return { client, pool: { connect: async () => client, end: async () => {} } };
}

async function migratedDb() {
    const pg = new PGlite() as unknown as AnyPg;
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    for (const f of files) {
        await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    }
    return { pg, ...poolFor(pg) };
}

type Row = {
    body: string;
    formatted_body: string | null;
    user_id: string;
    matrix_room_id: string;
    status: string;
};

const rowOf = async (pg: AnyPg, id: string): Promise<Row> => {
    const res = await pg.query(
        'SELECT body, formatted_body, user_id, matrix_room_id, status FROM scheduled_messages WHERE id = $1',
        [id]
    );
    assert.equal(res.rows.length, 1, `row ${id} exists`);
    return res.rows[0] as Row;
};

const due = () => new Date(Date.now() - 1000).toISOString();

test('erasing a scheduled message reaches Postgres and survives a restart (D-3)', async () => {
    const { pg, pool } = await migratedDb();
    try {
        const store1 = new PostgresBackedDb();
        await store1.init(pool as never);
        const id = randomUUID();
        store1.createScheduledMessage({
            id,
            userId: randomUUID(),
            matrixRoomId: '!room:test.local',
            body: 'text to erase',
            formattedBody: '<b>text to erase</b>',
            deliverAt: due(),
        });
        store1.eraseScheduledMessage(id);
        await store1.drain();

        const raw = await rowOf(pg, id);
        assert.equal(raw.body, '');
        assert.equal(raw.formatted_body, null);
        assert.equal(raw.user_id, '');
        assert.equal(raw.matrix_room_id, '');
        assert.equal(raw.status, 'cancelled');

        const store2 = new PostgresBackedDb();
        await store2.init(pool as never);
        const hydrated = store2.getScheduledMessage(id);
        assert.ok(hydrated, 'the erased row is still there, without content');
        assert.equal(hydrated?.body, '');
        assert.equal(hydrated?.userId, '');
        assert.equal(hydrated?.formattedBody, undefined);
        assert.equal(hydrated?.lastError, 'author_deleted');
    } finally {
        await pg.close?.();
    }
});

test('delivered, cancelled and failed rows lose their text in Postgres too', async () => {
    const { pg, pool } = await migratedDb();
    try {
        const store = new PostgresBackedDb();
        await store.init(pool as never);
        const userId = randomUUID();
        const make = (label: string) =>
            store.createScheduledMessage({
                id: randomUUID(),
                userId,
                matrixRoomId: '!room:test.local',
                body: `${label} body`,
                formattedBody: `<i>${label} body</i>`,
                deliverAt: due(),
            }).id;
        const delivered = make('delivered');
        const cancelled = make('cancelled');
        const failed = make('failed');
        const retrying = make('retrying');

        store.markScheduledMessageDelivered(delivered);
        store.cancelScheduledMessage(cancelled, userId);
        store.markScheduledMessageFailed(failed, 'refused_room_encrypted', { terminal: true });
        store.markScheduledMessageFailed(retrying, 'room_check_unavailable', { terminal: false });
        await store.drain();

        for (const id of [delivered, cancelled, failed]) {
            const raw = await rowOf(pg, id);
            assert.equal(raw.body, '', `${raw.status} row has no body`);
            assert.equal(raw.formatted_body, null, `${raw.status} row has no formatted body`);
        }
        const pending = await rowOf(pg, retrying);
        assert.equal(pending.status, 'pending');
        assert.equal(pending.body, 'retrying body', 'a row still to be sent keeps its text');
    } finally {
        await pg.close?.();
    }
});

test('migration 101 clears text left on finished rows by earlier versions (R-4)', async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const { client, pool } = poolFor(pg);
    try {
        await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR, targetOrdinal: 100 });
        const insert = async (id: string, status: string) =>
            client.query(
                `INSERT INTO scheduled_messages
                   (id, user_id, matrix_room_id, body, formatted_body, deliver_at, status, attempts, created_at)
                 VALUES ($1, $2, $3, $4, $5, now(), $6, 1, now())`,
                [
                    id,
                    'author',
                    '!room:test.local',
                    `${status} text`,
                    `<p>${status} text</p>`,
                    status,
                ]
            );
        const ids = {
            delivered: randomUUID(),
            failed: randomUUID(),
            cancelled: randomUUID(),
            pending: randomUUID(),
        };
        for (const [status, id] of Object.entries(ids)) await insert(id, status);

        // Up to 101 only, so later migrations do not change what this applies.
        const applied = await migrateUp({
            pool: pool as never,
            migrationsDir: MIGRATIONS_DIR,
            targetOrdinal: 101,
        });
        assert.deepEqual(
            applied.map((m) => m.id),
            ['101_scheduled_message_body_retention']
        );

        for (const status of ['delivered', 'failed', 'cancelled'] as const) {
            const raw = await rowOf(pg, ids[status]);
            assert.equal(raw.body, '', `${status}: body cleared`);
            assert.equal(raw.formatted_body, null, `${status}: formatted body cleared`);
            assert.equal(raw.user_id, 'author', `${status}: only the text is touched`);
        }
        const pending = await rowOf(pg, ids.pending);
        assert.equal(pending.body, 'pending text', 'a pending message keeps its text');
        assert.equal(pending.formatted_body, '<p>pending text</p>');
    } finally {
        await pg.close?.();
    }
});
