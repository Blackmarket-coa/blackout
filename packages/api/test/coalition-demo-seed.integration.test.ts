// Coalition demo seed gating + the db:clean-demo-seed cleanup core. The store
// must not pre-populate demo-canopy / @oak / @vine rows in production unless
// BLACKOUT_SEED_DEMO_DATA opts in, and the cleanup must delete exactly the seed
// ids (dry run by default, idempotent) from both the file snapshot and Postgres.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const seed = await import('../src/db/coalitionSeed');
const { PostgresBackedDb } = await import('../src/db/store');
const { cleanDemoSeedFile, cleanDemoSeedPostgres, cleanDemoSeedSnapshot } = await import(
    '../src/scripts/cleanCoalitionDemoSeed'
);
const { importJsonStoreState } = await import('../src/db/importJsonStore');
const { migrateUp, MIGRATIONS_DIR } = await import('../src/db/migrate');
const { PGlite } = await import('@electric-sql/pglite');

const SEED_TOTAL = Object.values(seed.COALITION_SEED_IDS).reduce((n, ids) => n + ids.length, 0);

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
    const prev: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) {
        prev[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try {
        return fn();
    } finally {
        for (const [k, v] of Object.entries(prev)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

// A store snapshot holding every seed row plus one real (non-seed) row per map.
function snapshotWithSeed() {
    return {
        users: [],
        coalitionSpatialItems: [
            ...seed.COALITION_SPATIAL_SEED,
            { ...seed.COALITION_SPATIAL_SEED[0], id: 'spatial-real-1', title: 'Real pin' },
        ],
        coalitionAidPosts: [
            ...seed.COALITION_AID_SEED,
            { ...seed.COALITION_AID_SEED[0], id: 'aidp_real_1', customerId: '@real:server' },
        ],
        coalitionTasks: [
            ...seed.COALITION_TASK_SEED,
            { ...seed.COALITION_TASK_SEED[0], id: 'task_real_1', denId: '!real:server' },
        ],
        sellerLocations: [
            ...seed.COALITION_SELLER_SEED,
            { ...seed.COALITION_SELLER_SEED[0], id: 'sloc_real_1', sellerId: 'seller-real' },
        ],
        coalitionFeedItems: [
            ...seed.COALITION_FEED_SEED,
            // Same canopy, but not a seed id: must survive.
            { ...seed.COALITION_FEED_SEED[0], id: 'feed-real-1', authorId: '@real:server' },
        ],
    };
}

test('shouldSeedCoalitionDemoData: off in production by default, explicit flag wins', () => {
    const f = seed.shouldSeedCoalitionDemoData;
    assert.equal(f({ NODE_ENV: 'production' }), false);
    assert.equal(f({ NODE_ENV: 'production', BLACKOUT_SEED_DEMO_DATA: '1' }), true);
    assert.equal(f({ NODE_ENV: 'production', BLACKOUT_SEED_DEMO_DATA: 'true' }), true);
    assert.equal(f({ NODE_ENV: 'development' }), true);
    assert.equal(f({ NODE_ENV: 'test' }), true);
    assert.equal(f({}), true);
    assert.equal(f({ NODE_ENV: 'development', BLACKOUT_SEED_DEMO_DATA: '0' }), false);
    assert.equal(f({ NODE_ENV: 'test', BLACKOUT_SEED_DEMO_DATA: 'false' }), false);
});

test('store does not seed coalition demo rows in production unless opted in', () => {
    const prod = withEnv(
        { NODE_ENV: 'production', BLACKOUT_SEED_DEMO_DATA: undefined },
        () => new PostgresBackedDb()
    );
    assert.equal(prod.coalitionSpatialItems.size, 0);
    assert.equal(prod.coalitionAidPosts.size, 0);
    assert.equal(prod.coalitionTasks.size, 0);
    assert.equal(prod.sellerLocations.size, 0);
    assert.equal(prod.coalitionFeedItems.size, 0);

    const optedIn = withEnv(
        { NODE_ENV: 'production', BLACKOUT_SEED_DEMO_DATA: '1' },
        () => new PostgresBackedDb()
    );
    assert.ok(optedIn.coalitionFeedItems.has('feed-video-1'));
    assert.ok(optedIn.coalitionAidPosts.has('aidp_seed_1'));

    const dev = withEnv(
        { NODE_ENV: 'development', BLACKOUT_SEED_DEMO_DATA: undefined },
        () => new PostgresBackedDb()
    );
    assert.equal(dev.coalitionSpatialItems.size, seed.COALITION_SPATIAL_SEED.length);
});

test('file snapshot cleanup: dry run by default, deletes only seed ids, idempotent', () => {
    const original = snapshotWithSeed();

    const dry = cleanDemoSeedSnapshot(original, { apply: false });
    assert.equal(dry.report.applied, false);
    assert.equal(dry.report.total, SEED_TOTAL);
    assert.equal(dry.snapshot, original, 'dry run returns the snapshot unchanged');
    assert.equal(original.coalitionFeedItems.length, seed.COALITION_FEED_SEED.length + 1);

    const applied = cleanDemoSeedSnapshot(original, { apply: true });
    assert.equal(applied.report.total, SEED_TOTAL);
    const ids = (key: keyof ReturnType<typeof snapshotWithSeed>) =>
        (applied.snapshot[key] as Array<{ id: string }>).map((r) => r.id);
    assert.deepEqual(ids('coalitionSpatialItems'), ['spatial-real-1']);
    assert.deepEqual(ids('coalitionAidPosts'), ['aidp_real_1']);
    assert.deepEqual(ids('coalitionTasks'), ['task_real_1']);
    assert.deepEqual(ids('sellerLocations'), ['sloc_real_1']);
    assert.deepEqual(ids('coalitionFeedItems'), ['feed-real-1']);
    assert.deepEqual(applied.snapshot.users, []);

    const again = cleanDemoSeedSnapshot(applied.snapshot, { apply: true });
    assert.equal(again.report.total, 0);
});

test('file cleanup on disk only writes with apply', () => {
    const dir = mkdtempSync(join(tmpdir(), 'blackout-seed-clean-'));
    const file = join(dir, 'store.json');
    writeFileSync(file, JSON.stringify(snapshotWithSeed()), 'utf8');
    const before = readFileSync(file, 'utf8');

    const dry = cleanDemoSeedFile(file, { apply: false });
    assert.equal(dry.total, SEED_TOTAL);
    assert.equal(readFileSync(file, 'utf8'), before, 'dry run leaves the file untouched');

    const applied = cleanDemoSeedFile(file, { apply: true });
    assert.equal(applied.total, SEED_TOTAL);
    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(
        after.coalitionFeedItems.map((r: { id: string }) => r.id),
        ['feed-real-1']
    );
    assert.equal(cleanDemoSeedFile(file, { apply: true }).total, 0);
});

type AnyPg = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<Array<{ rows?: unknown[] }>>;
};

// PGlite's query() rejects multi-statement SQL; route parameterless SQL to exec().
function wrap(pg: AnyPg) {
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

test('postgres cleanup: dry run counts, apply deletes only seed ids, idempotent', async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const { client, pool } = wrap(pg);
    await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
    const summary = await importJsonStoreState(client as never, snapshotWithSeed() as never);
    assert.equal(summary.totalFailed, 0, 'fixture must import cleanly');

    const count = async (table: string) => {
        const res = await client.query<{ n: number }>(
            `SELECT COUNT(*)::int AS n FROM ${table} WHERE id <> $1`,
            ['__none__']
        );
        return Number(res.rows[0].n);
    };

    const dry = await cleanDemoSeedPostgres(client as never, { apply: false });
    assert.equal(dry.total, SEED_TOTAL);
    assert.equal(await count('coalition_feed_items'), seed.COALITION_FEED_SEED.length + 1);

    const applied = await cleanDemoSeedPostgres(client as never, { apply: true });
    assert.equal(applied.total, SEED_TOTAL);
    for (const table of [
        'coalition_spatial_items',
        'coalition_aid_posts',
        'coalition_tasks',
        'seller_locations',
        'coalition_feed_items',
    ]) {
        assert.equal(await count(table), 1, `${table} keeps only the non-seed row`);
    }
    const kept = await client.query<{ id: string }>(
        'SELECT id FROM coalition_feed_items WHERE id <> $1',
        ['__none__']
    );
    assert.deepEqual(
        kept.rows.map((r) => r.id),
        ['feed-real-1']
    );

    const again = await cleanDemoSeedPostgres(client as never, { apply: true });
    assert.equal(again.total, 0);
});
