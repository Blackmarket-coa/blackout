// db:verify-import operator CLI core (compareSnapshotToDatabase): confirm the
// file->postgres user migration landed before billing goes live. Drives the real
// migrateUp so schema_migrations is populated (the folded-in checksum audit reads
// it), imports a snapshot via the same importer the CLI runs behind, then asserts
// the parity report: clean import => ok, a dropped user row => missing-rows, and
// legitimate post-import writes => ok-extra (still ok).

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.BLACKOUT_DB_MODE = 'memory';

const { compareSnapshotToDatabase } = await import('../src/scripts/verifyJsonStoreImport');
const { importJsonStoreState } = await import('../src/db/importJsonStore');
const { migrateUp, MIGRATIONS_DIR } = await import('../src/db/migrate');
const { PGlite } = await import('@electric-sql/pglite');

type AnyPg = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<Array<{ rows?: unknown[] }>>;
    close: () => Promise<void>;
};

// PGlite's query() is prepared-statement based and rejects multi-statement SQL;
// route parameterless SQL (migration batches, BEGIN/COMMIT, counts) to exec()
// and parameterized SQL to query(). This lets the REAL migrateUp run so
// schema_migrations is genuinely populated.
function wrap(pg: AnyPg) {
    const client = {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
            const hasParams = Array.isArray(params) && params.length > 0;
            if (!hasParams) {
                const results = await pg.exec(sql);
                const last = results.at(-1);
                return { rows: (last?.rows ?? []) as T[] };
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
    const { client, pool } = wrap(pg);
    await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
    return { pg, client, pool };
}

function mkUser(overrides: Record<string, unknown> = {}) {
    return {
        id: randomUUID(),
        username: `verify-${randomUUID().slice(0, 8)}`,
        email: `${randomUUID().slice(0, 8)}@example.test`,
        passwordHash: 'hash',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: `pk-${randomUUID().slice(0, 8)}`,
        createdAt: '2026-05-01T00:00:00.000Z',
        ...overrides,
    };
}

test('a clean import reports ok parity for populated tables and an empty usersDiff', async () => {
    const { client } = await migratedDb();
    const userA = mkUser();
    const userB = mkUser();
    const snapshot = {
        users: [userA, userB],
        streams: [
            {
                id: `stream-${randomUUID().slice(0, 8)}`,
                creatorId: 'creator-x',
                state: 'offline',
                title: 'Imported stream',
                tags: ['a', 'b'],
                visibility: 'public',
                allowedSubscriberIds: [],
                latencyProfile: 'normal',
                createdAt: '2026-05-01T00:00:00.000Z',
                updatedAt: '2026-05-01T00:00:00.000Z',
            },
        ],
        linkedAccounts: [
            {
                id: randomUUID(),
                blackoutUserId: userA.id,
                provider: 'twitch',
                providerUserId: 'tw-1',
                accessTokenCiphertext: 'cipher',
                scopes: ['chat:read'],
                encryptionKeyId: 'key-1',
                createdAt: '2026-05-01T00:00:00.000Z',
                updatedAt: '2026-05-01T00:00:00.000Z',
            },
        ],
    };

    const summary = await importJsonStoreState(client as never, snapshot as never);
    assert.equal(summary.totalFailed, 0, 'fixture must import cleanly');

    const report = await compareSnapshotToDatabase(client as never, snapshot as never);

    assert.equal(report.ok, true, 'a faithful import must verify as ok');
    const find = (mapName: string) => report.tables.find((t) => t.mapName === mapName);
    assert.equal(find('users')?.status, 'ok');
    assert.equal(find('users')?.snapshotCount, 2);
    assert.equal(find('users')?.dbCount, 2);
    assert.equal(find('streams')?.status, 'ok');
    assert.equal(find('linkedAccounts')?.status, 'ok');

    assert.ok(report.usersDiff, 'users diff is always computed');
    assert.equal(report.usersDiff?.shownCount, 0, 'no snapshot user id may be missing');
    assert.deepEqual(report.usersDiff?.missingInDb, []);

    // The folded-in checksum audit passes because migrateUp populated
    // schema_migrations from the same on-disk files it now re-hashes.
    assert.equal(report.checksums?.ok, true);
});

test('a users row dropped in postgres surfaces as missing-rows, fails ok, and names the id', async () => {
    const { client } = await migratedDb();
    const keep = mkUser();
    const drop = mkUser();
    const snapshot = { users: [keep, drop] };

    const summary = await importJsonStoreState(client as never, snapshot as never);
    assert.equal(summary.imported.users, 2);

    // Simulate a partial user migration: one snapshot user never reached PG.
    await client.query('DELETE FROM users WHERE id = $1', [drop.id]);

    const report = await compareSnapshotToDatabase(client as never, snapshot as never);

    assert.equal(report.ok, false, 'a missing user row must fail the overall verification');
    const users = report.tables.find((t) => t.mapName === 'users');
    assert.equal(users?.status, 'missing-rows');
    assert.equal(users?.snapshotCount, 2);
    assert.equal(users?.dbCount, 1);

    assert.equal(report.usersDiff?.shownCount, 1);
    assert.ok(
        report.usersDiff?.missingInDb.includes(drop.id),
        'the dropped id must be listed in the users diff'
    );
    assert.ok(
        !report.usersDiff?.missingInDb.includes(keep.id),
        'the retained id must not be listed'
    );
});

test('legitimate post-import writes read as ok-extra and keep the report ok', async () => {
    const { client } = await migratedDb();
    const snapshot = { users: [mkUser()] };

    await importJsonStoreState(client as never, snapshot as never);

    // A row written AFTER the import (e.g. a webhook the live server processed)
    // inflates a table above its snapshot count. That is expected, not a gap.
    await client.query(
        'INSERT INTO processed_billing_webhook_events (event_id, processed_at) VALUES ($1, $2)',
        ['evt-post-import-1', new Date().toISOString()]
    );

    const report = await compareSnapshotToDatabase(client as never, snapshot as never);

    assert.equal(report.ok, true, 'extra rows beyond the snapshot are allowed');
    const extra = report.tables.find((t) => t.mapName === 'processedBillingWebhookEvents');
    assert.equal(extra?.status, 'ok-extra');
    assert.equal(extra?.snapshotCount, 0);
    assert.equal(extra?.dbCount, 1);
    // The users table the snapshot did seed is still exactly covered.
    assert.equal(report.tables.find((t) => t.mapName === 'users')?.status, 'ok');
});
