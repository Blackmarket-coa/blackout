import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
    discoverMigrations,
    fetchApplied,
    migrateDown,
    migrateUp,
    status,
} from '../src/db/migrate';

// Adapter so PGlite (which exposes its own .query) satisfies our PgClient
// interface. Production uses node-postgres; the contract is just `query`.
//
// PGlite's `query()` is prepared-statement based and rejects multi-statement
// SQL. Migration files frequently contain multiple statements, so we route
// SQL with no parameter placeholders to `exec()` (which accepts batches)
// and SQL with parameters to `query()`.
const wrap = (db: PGlite) => ({
    connect: async () => ({
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
            const hasParams = Array.isArray(params) && params.length > 0;
            if (!hasParams) {
                const results = await db.exec(sql);
                const last = results.at(-1);
                return { rows: (last?.rows ?? []) as T[] };
            }
            const result = await db.query<T>(sql, params as never);
            return { rows: result.rows };
        },
        release: () => undefined,
    }),
    end: async () => {
        await db.close();
    },
});

const writeMigration = (dir: string, name: string, body: string) => {
    writeFileSync(join(dir, name), body, 'utf8');
};

test('discoverMigrations pairs up/down by id and orders by ordinal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-disc-'));
    writeMigration(dir, '001_init.sql', 'SELECT 1;');
    writeMigration(dir, '002_add_thing.up.sql', 'CREATE TABLE thing (id INT);');
    writeMigration(dir, '002_add_thing.down.sql', 'DROP TABLE thing;');
    writeMigration(dir, '010_skip.up.sql', 'CREATE TABLE skip (id INT);');
    writeMigration(dir, '010_skip.down.sql', 'DROP TABLE skip;');

    const found = discoverMigrations(dir);
    assert.deepEqual(
        found.map((m) => m.id),
        ['001_init', '002_add_thing', '010_skip']
    );
    assert.equal(found[0].downPath, null);
    assert.ok(found[1].downPath);
    assert.ok(found[2].downPath);
});

test('discoverMigrations rejects duplicate ordinals', () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-dup-'));
    writeMigration(dir, '001_a.sql', 'SELECT 1;');
    writeMigration(dir, '001_b.sql', 'SELECT 2;');
    assert.throws(() => discoverMigrations(dir), /Duplicate migration ordinal/);
});

test('migrateUp applies pending and is idempotent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-up-'));
    writeMigration(dir, '001_init.sql', 'CREATE TABLE alpha (id INT);');
    writeMigration(dir, '002_extend.up.sql', 'CREATE TABLE beta (id INT);');
    writeMigration(dir, '002_extend.down.sql', 'DROP TABLE beta;');

    const db = new PGlite();
    const pool = wrap(db);
    try {
        const first = await migrateUp({ pool, migrationsDir: dir });
        assert.equal(first.length, 2);

        const second = await migrateUp({ pool, migrationsDir: dir });
        assert.equal(second.length, 0, 'second run should be a no-op');

        const tables = await db.query<{ c: number }>(
            `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('alpha', 'beta')`
        );
        assert.equal(tables.rows[0]?.c, 2);
    } finally {
        await pool.end();
    }
});

test('migrateUp aborts a failing migration in a transaction', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-fail-'));
    writeMigration(dir, '001_ok.sql', 'CREATE TABLE first_table (id INT);');
    writeMigration(dir, '002_bad.up.sql', 'CREATE TABLE second_table (id INT); SELECT 1/0;');
    writeMigration(dir, '002_bad.down.sql', 'DROP TABLE IF EXISTS second_table;');

    const db = new PGlite();
    const pool = wrap(db);
    try {
        await assert.rejects(migrateUp({ pool, migrationsDir: dir }), /Migration 002_bad failed/);
        // The first migration committed; the failing second one rolled back.
        const tables = await db.query<{ c: number }>(
            `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('first_table', 'second_table')`
        );
        assert.equal(tables.rows[0]?.c, 1);
        const applied = await fetchApplied(await pool.connect());
        assert.deepEqual(
            applied.map((a) => a.id),
            ['001_ok']
        );
    } finally {
        await pool.end();
    }
});

test('migrateDown reverts the most recent reversible migration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-down-'));
    // 007 is at the reversible floor; legacy 001 is forward-only.
    writeMigration(dir, '001_init.sql', 'CREATE TABLE base (id INT);');
    writeMigration(dir, '007_extend.up.sql', 'CREATE TABLE extra (id INT);');
    writeMigration(dir, '007_extend.down.sql', 'DROP TABLE extra;');

    const db = new PGlite();
    const pool = wrap(db);
    try {
        await migrateUp({ pool, migrationsDir: dir });
        const reverted = await migrateDown({ pool, migrationsDir: dir, targetOrdinal: 6 });
        assert.equal(reverted.length, 1);
        assert.equal(reverted[0].id, '007_extend');

        const tables = await db.query<{ c: number }>(
            `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('base', 'extra')`
        );
        assert.equal(tables.rows[0]?.c, 1, 'extra is gone, base remains');
    } finally {
        await pool.end();
    }
});

test('migrateDown refuses to descend below the non-reversible floor', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-floor-'));
    writeMigration(dir, '001_init.sql', 'CREATE TABLE base (id INT);');

    const db = new PGlite();
    const pool = wrap(db);
    try {
        await migrateUp({ pool, migrationsDir: dir });
        await assert.rejects(
            migrateDown({ pool, migrationsDir: dir, targetOrdinal: 0 }),
            /forward-only and not reversible/
        );
    } finally {
        await pool.end();
    }
});

test('migrateUp fails fast when an applied migration file was edited (M12 checksum drift)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-drift-'));
    writeMigration(dir, '001_init.sql', 'CREATE TABLE alpha (id INT);');
    writeMigration(dir, '002_extend.up.sql', 'CREATE TABLE beta (id INT);');
    writeMigration(dir, '002_extend.down.sql', 'DROP TABLE beta;');

    const db = new PGlite();
    const pool = wrap(db);
    try {
        await migrateUp({ pool, migrationsDir: dir });

        // Edit an already-applied migration file in place — the silent-drift hazard.
        writeMigration(dir, '002_extend.up.sql', 'CREATE TABLE beta (id INT, extra TEXT);');

        // status surfaces the drift...
        const snap = await status({ pool, migrationsDir: dir });
        assert.equal(snap.drift.length, 1);
        assert.equal(snap.drift[0].id, '002_extend');

        // ...and a subsequent migrateUp refuses to proceed.
        await assert.rejects(migrateUp({ pool, migrationsDir: dir }), /checksum drift/i);
    } finally {
        await pool.end();
    }
});

test('status reports applied vs pending', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-status-'));
    writeMigration(dir, '001_one.sql', 'CREATE TABLE one (id INT);');
    writeMigration(dir, '002_two.up.sql', 'CREATE TABLE two (id INT);');
    writeMigration(dir, '002_two.down.sql', 'DROP TABLE two;');

    const db = new PGlite();
    const pool = wrap(db);
    try {
        let snapshot = await status({ pool, migrationsDir: dir });
        assert.equal(snapshot.pending.length, 2);
        assert.equal(snapshot.applied.length, 0);

        await migrateUp({ pool, migrationsDir: dir, targetOrdinal: 1 });
        snapshot = await status({ pool, migrationsDir: dir });
        assert.equal(snapshot.applied.length, 1);
        assert.equal(snapshot.pending.length, 1);
        assert.equal(snapshot.applied[0].id, '001_one');
    } finally {
        await pool.end();
    }
});
