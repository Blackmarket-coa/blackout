/**
 * Release identities must survive a restart in Postgres, keep their history
 * (the replaced row's superseded_at written before the new row), and be
 * erased in Postgres with the account, not only in the in-memory mirror,
 * without touching any other account's rows. The store writes
 * only fields that have a column (migration 104), so these run
 * PostgresBackedDb against an in-process PGlite with every migration applied
 * and read the rows back after a simulated restart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.BLACKOUT_DB_MODE = 'memory';

const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { PGlite } = await import('@electric-sql/pglite');
const { ALICE, BOB } = await import('../../blackout-protocol/src/release/testVectors');

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

const rowsFor = async (pg: AnyPg, accountId: string) =>
    (
        await pg.query(
            'SELECT id, fingerprint, signature, superseded_at FROM release_identities WHERE account_id = $1 ORDER BY published_at',
            [accountId]
        )
    ).rows as Array<{
        id: string;
        fingerprint: string;
        signature: string;
        superseded_at: unknown;
    }>;

const vectorRecord = (person: typeof ALICE) => ({
    id: randomUUID(),
    accountId: person.identity.accountId,
    formatVersion: person.identity.v,
    signingKey: person.identity.signingKey,
    x25519Key: person.identity.x25519Key,
    mlkem768Key: person.identity.mlkem768Key,
    signature: person.identity.signature,
    fingerprint: person.fingerprint,
});

test('a published identity and its replacement survive a restart, history and all', async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const pool = poolFor(pg);
    try {
        await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
        const store1 = new PostgresBackedDb();
        await store1.init(pool as never);

        const accountId = ALICE.identity.accountId;
        const first = store1.publishReleaseIdentity(vectorRecord(ALICE));
        // Same account, another identity (Bob's keys stand in: the store does
        // not check signatures, the route does).
        const second = store1.publishReleaseIdentity({ ...vectorRecord(BOB), accountId });
        await store1.drain();

        const rows = await rowsFor(pg, accountId);
        assert.equal(rows.length, 2);
        const firstRow = rows.find((row) => row.id === first.id);
        const secondRow = rows.find((row) => row.id === second.id);
        assert.ok(firstRow?.superseded_at, 'the replaced row has superseded_at in Postgres');
        assert.equal(secondRow?.superseded_at, null);

        const store2 = new PostgresBackedDb();
        await store2.init(pool as never);
        const current = store2.getCurrentReleaseIdentity(accountId);
        assert.equal(current?.id, second.id);
        assert.equal(current?.fingerprint, BOB.fingerprint);
        assert.equal(current?.signature, BOB.identity.signature);
        const history = store2.listReleaseIdentitiesForAccount(accountId);
        assert.equal(history.length, 2);
        const replaced = history.find((record) => record.id === first.id);
        assert.equal(replaced?.mlkem768Key, ALICE.identity.mlkem768Key);
        assert.ok(replaced?.supersededAt);
    } finally {
        await pg.close?.();
    }
});

const rowById = async (pg: AnyPg, id: string) =>
    (
        await pg.query(
            'SELECT account_id, signing_key, x25519_key, mlkem768_key, signature, fingerprint, superseded_at FROM release_identities WHERE id = $1',
            [id]
        )
    ).rows[0] as Record<string, unknown> | undefined;

test('erasing an account’s identities blanks its rows in Postgres, and only those', async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const pool = poolFor(pg);
    try {
        await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
        const store1 = new PostgresBackedDb();
        await store1.init(pool as never);
        const accountId = ALICE.identity.accountId;
        const first = store1.publishReleaseIdentity(vectorRecord(ALICE));
        const second = store1.publishReleaseIdentity({ ...vectorRecord(BOB), accountId });
        store1.publishReleaseIdentity(vectorRecord(BOB));
        await store1.drain();
        assert.equal((await rowsFor(pg, accountId)).length, 2);

        for (const record of store1.listReleaseIdentitiesForAccount(accountId)) {
            assert.ok(store1.eraseReleaseIdentity(record.id));
        }
        await store1.drain();
        assert.equal((await rowsFor(pg, accountId)).length, 0);
        for (const id of [first.id, second.id]) {
            const stub = await rowById(pg, id);
            assert.deepEqual(
                { ...stub, superseded_at: stub?.superseded_at ? 'set' : null },
                {
                    account_id: '',
                    signing_key: '',
                    x25519_key: '',
                    mlkem768_key: '',
                    signature: '',
                    fingerprint: '',
                    superseded_at: 'set',
                }
            );
        }
        assert.equal((await rowsFor(pg, BOB.identity.accountId)).length, 1);

        const store2 = new PostgresBackedDb();
        await store2.init(pool as never);
        assert.equal(store2.listReleaseIdentitiesForAccount(accountId).length, 0);
        assert.equal(
            store2.getCurrentReleaseIdentity(BOB.identity.accountId)?.fingerprint,
            BOB.fingerprint
        );
    } finally {
        await pg.close?.();
    }
});

test('an erasure on one replica leaves a publish another replica has not mirrored yet', async () => {
    // L6 of the independent review: account deletion used to resync the whole
    // table, which deletes every Postgres row the deleting replica's mirror
    // lacks, such as another account's publish that replica B wrote moments
    // ago. Two stores on one database, with no change transport between them,
    // stand in for that window.
    const pg = new PGlite() as unknown as AnyPg;
    const pool = poolFor(pg);
    try {
        await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
        const replicaA = new PostgresBackedDb();
        await replicaA.init(pool as never);
        const replicaB = new PostgresBackedDb();
        await replicaB.init(pool as never);

        const leaving = ALICE.identity.accountId;
        replicaA.publishReleaseIdentity(vectorRecord(ALICE));
        await replicaA.drain();
        // Replica B publishes for someone else; A never hears of it.
        const staying = replicaB.publishReleaseIdentity(vectorRecord(BOB));
        await replicaB.drain();

        for (const record of replicaA.listReleaseIdentitiesForAccount(leaving)) {
            replicaA.eraseReleaseIdentity(record.id);
        }
        await replicaA.drain();

        assert.equal((await rowsFor(pg, leaving)).length, 0);
        const kept = await rowsFor(pg, BOB.identity.accountId);
        assert.deepEqual(
            kept.map((row) => row.id),
            [staying.id],
            'the other replica’s row is still in Postgres'
        );
    } finally {
        await pg.close?.();
    }
});
