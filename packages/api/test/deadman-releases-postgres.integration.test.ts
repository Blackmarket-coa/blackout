/**
 * A release switch's sealed copies and notices must survive a restart in
 * Postgres (migration 106), a copy's removal must blank its row in Postgres
 * and only that row, a notice's room must be cleared in Postgres when the
 * store clears it, a release switch must have no room there, and the down
 * migration must refuse to run while a release switch exists. The store
 * writes only fields that have a column, so these run PostgresBackedDb
 * against an in-process PGlite with every migration applied and read the
 * rows back after a simulated restart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.BLACKOUT_DB_MODE = 'memory';

const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateDown, migrateUp } = await import('../src/db/migrate');
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

const FINGERPRINT = 'ab'.repeat(32);

const releaseSwitch = (ownerId: string, recipients: string[]) => ({
    id: randomUUID(),
    ownerId,
    status: 'armed' as const,
    checkInIntervalSeconds: 3600,
    gracePeriodSeconds: 600,
    lastCheckInAt: '2026-01-01T00:00:00.000Z',
    triggerAt: '2026-01-01T01:00:00.000Z',
    releaseAt: '2026-01-01T01:10:00.000Z',
    recipients,
    encryptedPayload: '{"header":{},"ownerIdentity":{}}',
    headline: 'owner-only label',
    releaseFormat: 'release-v1' as const,
});

const legacySwitch = (ownerId: string) => ({
    id: randomUUID(),
    ownerId,
    roomId: '!room:test.local',
    status: 'armed' as const,
    checkInIntervalSeconds: 3600,
    gracePeriodSeconds: 600,
    lastCheckInAt: '2026-01-01T00:00:00.000Z',
    triggerAt: '2026-01-01T01:00:00.000Z',
    releaseAt: '2026-01-01T01:10:00.000Z',
    recipients: ['someone'],
    encryptedPayload: 'sealed',
});

const wrapRows = async (pg: AnyPg, switchId: string) =>
    (
        await pg.query(
            'SELECT recipient_account_id, recipient_fingerprint, sealed_key, signature FROM deadman_release_wraps WHERE switch_id = $1 ORDER BY recipient_account_id',
            [switchId]
        )
    ).rows as Array<{
        recipient_account_id: string;
        recipient_fingerprint: string;
        sealed_key: string;
        signature: string;
    }>;

const switchRow = async (pg: AnyPg, id: string) =>
    (
        await pg.query(
            'SELECT room_id, release_format, released_at, encrypted_payload FROM deadman_switches WHERE id = $1',
            [id]
        )
    ).rows[0] as {
        room_id: unknown;
        release_format: string;
        released_at: unknown;
        encrypted_payload: string;
    };

test('a release switch, its copies and its notices survive a restart; it has no room, and a legacy row reads legacy', async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const pool = poolFor(pg);
    try {
        await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
        const store1 = new PostgresBackedDb();
        await store1.init(pool as never);

        const owner = randomUUID();
        const bob = randomUUID();
        const sw = store1.createDeadmanSwitch(releaseSwitch(owner, [bob]));
        const legacy = store1.createDeadmanSwitch(legacySwitch(owner));
        store1.putDeadmanReleaseWrap({
            switchId: sw.id,
            recipientAccountId: owner,
            recipientFingerprint: FINGERPRINT,
            sealedKey: 'owner-copy',
            signature: 'owner-signature',
        });
        store1.putDeadmanReleaseWrap({
            switchId: sw.id,
            recipientAccountId: bob,
            recipientFingerprint: 'cd'.repeat(32),
            sealedKey: 'bob-copy',
            signature: 'bob-signature',
        });
        store1.updateDeadmanSwitch(sw.id, {
            status: 'triggered',
            releasedAt: '2026-01-01T01:10:30.000Z',
        });
        assert.ok(
            store1.createDeadmanReleaseNotice({
                switchId: sw.id,
                recipientAccountId: bob,
                nextAttemptAt: '2026-01-01T01:10:30.000Z',
            })
        );
        store1.updateDeadmanReleaseNotice(sw.id, bob, {
            roomId: '!notices:test.local',
            reinvitedAt: '2026-01-01T01:10:45.000Z',
            status: 'sent',
            attempts: 1,
            sentAt: '2026-01-01T01:11:00.000Z',
        });
        await store1.drain();

        const row = await switchRow(pg, sw.id);
        assert.equal(row.room_id, null, 'a release switch has no room in Postgres');
        assert.equal(row.release_format, 'release-v1');
        assert.ok(row.released_at instanceof Date);
        assert.equal((row.released_at as Date).toISOString(), '2026-01-01T01:10:30.000Z');
        const legacyRow = await switchRow(pg, legacy.id);
        assert.equal(legacyRow.room_id, '!room:test.local');
        assert.equal(
            legacyRow.release_format,
            'legacy',
            'a row written without a format is legacy'
        );
        assert.equal(legacyRow.released_at, null);
        assert.equal((await wrapRows(pg, sw.id)).length, 2);

        const store2 = new PostgresBackedDb();
        await store2.init(pool as never);
        const hydrated = store2.getDeadmanSwitch(sw.id);
        assert.equal(hydrated?.roomId, undefined);
        assert.equal(hydrated?.releaseFormat, 'release-v1');
        assert.equal(hydrated?.releasedAt, '2026-01-01T01:10:30.000Z');
        assert.equal(hydrated?.status, 'triggered');
        assert.equal(store2.getDeadmanSwitch(legacy.id)?.releaseFormat, 'legacy');
        assert.equal(store2.getDeadmanSwitch(legacy.id)?.roomId, '!room:test.local');

        const bobsCopy = store2.getDeadmanReleaseWrap(sw.id, bob);
        assert.equal(bobsCopy?.sealedKey, 'bob-copy');
        assert.equal(bobsCopy?.signature, 'bob-signature');
        assert.equal(bobsCopy?.recipientFingerprint, 'cd'.repeat(32));
        assert.equal(store2.getDeadmanReleaseWrap(sw.id, owner)?.sealedKey, 'owner-copy');
        assert.deepEqual(
            store2.listDeadmanReleaseWrapsForRecipient(bob).map((w) => w.switchId),
            [sw.id]
        );
        assert.equal(store2.listDeadmanReleaseWraps(sw.id).length, 2);

        const notice = store2.getDeadmanReleaseNotice(sw.id, bob);
        assert.equal(notice?.status, 'sent');
        assert.equal(notice?.roomId, '!notices:test.local');
        assert.equal(
            notice?.reinvitedAt,
            '2026-01-01T01:10:45.000Z',
            'the re-invite marker has a column'
        );
        assert.equal(notice?.attempts, 1);
        assert.equal(notice?.sentAt, '2026-01-01T01:11:00.000Z');
        assert.equal(store2.findDeadmanNoticeRoom(bob), '!notices:test.local');
        assert.equal(store2.listDueDeadmanReleaseNotices('2026-02-01T00:00:00.000Z').length, 0);
        assert.equal(
            store2.listDeadmanReleaseNotices(sw.id).length,
            1,
            'listed by switch after hydration'
        );

        // A wholesale refresh of the mirror (the listener's reconnect, a peer's
        // table resync) rebuilds the by-switch index with the rows.
        await (store2 as unknown as { rehydrateAll(): Promise<void> }).rehydrateAll();
        assert.equal(
            store2.listDeadmanReleaseWraps(sw.id).length,
            2,
            'copies listed by switch after a refresh'
        );
        assert.equal(store2.listDeadmanReleaseNotices(sw.id).length, 1);
        assert.equal(store2.getDeadmanReleaseWrap(sw.id, bob)?.sealedKey, 'bob-copy');
    } finally {
        await pg.close?.();
    }
});

test('removing a copy blanks its row in Postgres and only that row; clearing a notice room clears the column', async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const pool = poolFor(pg);
    try {
        await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
        const store1 = new PostgresBackedDb();
        await store1.init(pool as never);
        const owner = randomUUID();
        const bob = randomUUID();
        const carol = randomUUID();
        const sw = store1.createDeadmanSwitch(releaseSwitch(owner, [bob, carol]));
        for (const [account, who] of [
            [owner, 'owner'],
            [bob, 'bob'],
            [carol, 'carol'],
        ] as const) {
            store1.putDeadmanReleaseWrap({
                switchId: sw.id,
                recipientAccountId: account,
                recipientFingerprint: FINGERPRINT,
                sealedKey: `${who}-copy`,
                signature: `${who}-signature`,
            });
        }
        store1.createDeadmanReleaseNotice({
            switchId: sw.id,
            recipientAccountId: bob,
            nextAttemptAt: '2026-01-01T01:10:30.000Z',
        });
        store1.updateDeadmanReleaseNotice(sw.id, bob, { roomId: '!notices:test.local' });
        await store1.drain();

        assert.ok(store1.eraseDeadmanReleaseWrap(sw.id, bob));
        store1.updateDeadmanReleaseNotice(sw.id, bob, {
            roomId: undefined,
            status: 'failed',
            lastError: 'recipient_gone',
            failedAt: '2026-01-02T00:00:00.000Z',
        });
        await store1.drain();

        const rows = await wrapRows(pg, sw.id);
        assert.equal(rows.length, 3, 'the row stays, saying whom it was for');
        const blanked = rows.find((r) => r.recipient_account_id === bob);
        assert.deepEqual(
            { key: blanked?.sealed_key, sig: blanked?.signature },
            // '' is stored as NULL in nullable columns; these are NOT NULL, so '' stays.
            { key: '', sig: '' }
        );
        assert.equal(blanked?.recipient_fingerprint, FINGERPRINT);
        assert.equal(rows.find((r) => r.recipient_account_id === carol)?.sealed_key, 'carol-copy');
        assert.equal(rows.find((r) => r.recipient_account_id === owner)?.sealed_key, 'owner-copy');

        const noticeRow = (
            await pg.query(
                'SELECT room_id, status, last_error, failed_at FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
                [sw.id, bob]
            )
        ).rows[0] as { room_id: unknown; status: string; last_error: string; failed_at: unknown };
        assert.equal(noticeRow.room_id, null, 'the cleared room is NULL in Postgres');
        assert.equal(noticeRow.status, 'failed');
        assert.equal(noticeRow.last_error, 'recipient_gone');
        assert.ok(noticeRow.failed_at instanceof Date);

        const store2 = new PostgresBackedDb();
        await store2.init(pool as never);
        assert.equal(store2.getDeadmanReleaseWrap(sw.id, bob)?.sealedKey, '');
        assert.equal(store2.getDeadmanReleaseWrap(sw.id, carol)?.sealedKey, 'carol-copy');
        assert.equal(store2.getDeadmanReleaseNotice(sw.id, bob)?.roomId, undefined);
        assert.equal(store2.findDeadmanNoticeRoom(bob), undefined);
    } finally {
        await pg.close?.();
    }
});

test('migration 106 cannot be reverted while a release switch exists, and can once only legacy rows remain', async () => {
    const pg = new PGlite() as unknown as AnyPg;
    const pool = poolFor(pg);
    try {
        await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
        const store = new PostgresBackedDb();
        await store.init(pool as never);
        const owner = randomUUID();
        store.createDeadmanSwitch(legacySwitch(owner));
        const release = store.createDeadmanSwitch(releaseSwitch(owner, [randomUUID()]));
        await store.drain();

        await assert.rejects(
            migrateDown({ pool: pool as never, migrationsDir: MIGRATIONS_DIR, targetOrdinal: 105 }),
            /release-format switches; 106 cannot be reverted/
        );
        // Refused inside the transaction: nothing was dropped.
        assert.equal((await pg.query('SELECT 1 FROM deadman_release_wraps')).rows.length, 0);
        assert.equal((await switchRow(pg, release.id)).release_format, 'release-v1');

        await pg.query('DELETE FROM deadman_switches WHERE id = $1', [release.id]);
        const reverted = await migrateDown({
            pool: pool as never,
            migrationsDir: MIGRATIONS_DIR,
            targetOrdinal: 105,
        });
        assert.deepEqual(
            reverted.map((m) => m.ordinal),
            [106]
        );
        const columns = (
            await pg.query(
                "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'deadman_switches' AND column_name IN ('room_id', 'release_format', 'released_at')"
            )
        ).rows as Array<{ column_name: string; is_nullable: string }>;
        assert.deepEqual(columns, [{ column_name: 'room_id', is_nullable: 'NO' }]);
        const tables = (
            await pg.query(
                "SELECT table_name FROM information_schema.tables WHERE table_name IN ('deadman_release_wraps', 'deadman_release_notices')"
            )
        ).rows;
        assert.equal(tables.length, 0);
    } finally {
        await pg.close?.();
    }
});
