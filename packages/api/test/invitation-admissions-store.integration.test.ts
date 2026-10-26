/**
 * Invitation admissions — the use an account-number sign-up spent, and the
 * account that claimed it (D3 in
 * docs/security/api-findings-triage-2026-10-25.md) — have to survive a restart
 * in every store mode, or an account's first redeem after one would spend a
 * second use. The claim is a compare-and-set. File mode persists through a
 * per-mutator override and Postgres mode through MUTATOR_SPECS plus migration
 * 105; a mutator missing from either passes every memory-mode test and loses
 * the row on restart, so both are read back here after a simulated restart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'invitation-admissions-'));
process.env.BLACKOUT_DB_MODE = 'file';
process.env.BLACKOUT_DB_FILE = join(tmpDir, 'store.json');
process.env.NODE_ENV = 'development';
delete process.env.BLACKOUT_DEMO_PASSWORD;

const { FileBackedDb, PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR } = await import('../src/db/migrate');
const { PGlite } = await import('@electric-sql/pglite');

test.after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});

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

async function migratedPg() {
    const pg = new PGlite() as unknown as AnyPg;
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    for (const f of files) {
        await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    }
    return { pg, pool: poolFor(pg) };
}

type Store = InstanceType<typeof FileBackedDb>;

const admit = (store: Store, matrixUserId: string, invitationTokenId = randomUUID()) =>
    store.createInvitationAdmission({
        id: randomUUID(),
        invitationTokenId,
        matrixUserId,
        matrixInviteOk: true,
    });

test('a claim is a compare-and-set: the second claim of one admission gets nothing', () => {
    const store = new FileBackedDb();
    const admission = admit(store, '@cas:test.local');
    const first = store.claimInvitationAdmission(admission.id, 'user-a');
    assert.equal(first?.claimedByUserId, 'user-a');
    assert.ok(first?.claimedAt);
    assert.equal(store.claimInvitationAdmission(admission.id, 'user-a'), undefined);
    assert.equal(store.claimInvitationAdmission(admission.id, 'user-b'), undefined);
    assert.equal(
        store.findInvitationAdmission(admission.invitationTokenId, '@cas:test.local')
            ?.claimedByUserId,
        'user-a'
    );
    assert.equal(store.claimInvitationAdmission(randomUUID(), 'user-a'), undefined);
});

test('file mode keeps admissions and their claims across a restart, and their deletion', () => {
    // Every write persists the whole snapshot, so each mutator here is the last
    // write before a restart: only its own persist can carry it across.
    const find = (store: Store, admission: { invitationTokenId: string; matrixUserId: string }) =>
        store.findInvitationAdmission(admission.invitationTokenId, admission.matrixUserId);

    const first = new FileBackedDb();
    const claimed = admit(first, '@file-claimed:test.local');
    first.claimInvitationAdmission(claimed.id, 'user-file');

    const second = new FileBackedDb();
    assert.equal(find(second, claimed)?.claimedByUserId, 'user-file');
    const unclaimed = admit(second, '@file-unclaimed:test.local');

    const third = new FileBackedDb();
    assert.equal(find(third, unclaimed)?.claimedByUserId, undefined);
    assert.equal(find(third, unclaimed)?.matrixInviteOk, true);
    third.deleteInvitationAdmissionsForUser('user-file', '@file-unclaimed:test.local');

    const fourth = new FileBackedDb();
    assert.equal(find(fourth, claimed), undefined);
    assert.equal(find(fourth, unclaimed), undefined);
});

test('Postgres mode writes admissions, their claims and their deletion through migration 105', async () => {
    const { pg, pool } = await migratedPg();
    try {
        const store1 = new PostgresBackedDb();
        await store1.init(pool as never);
        const claimed = store1.createInvitationAdmission({
            id: randomUUID(),
            invitationTokenId: randomUUID(),
            matrixUserId: '@pg-claimed:test.local',
            matrixInviteOk: false,
        });
        assert.ok(store1.claimInvitationAdmission(claimed.id, 'user-pg'));
        const unclaimed = store1.createInvitationAdmission({
            id: randomUUID(),
            invitationTokenId: randomUUID(),
            matrixUserId: '@pg-unclaimed:test.local',
        });
        await store1.drain();

        const rows = (
            await pg.query(
                'SELECT id, matrix_user_id, matrix_invite_ok, claimed_by_user_id, claimed_at FROM invitation_admissions ORDER BY matrix_user_id'
            )
        ).rows as Array<{
            id: string;
            matrix_user_id: string;
            matrix_invite_ok: boolean | null;
            claimed_by_user_id: string | null;
            claimed_at: unknown;
        }>;
        assert.equal(rows.length, 2);
        assert.equal(rows[0].matrix_user_id, '@pg-claimed:test.local');
        assert.equal(rows[0].matrix_invite_ok, false);
        assert.equal(rows[0].claimed_by_user_id, 'user-pg');
        assert.ok(rows[0].claimed_at);
        assert.equal(rows[1].claimed_by_user_id, null);
        assert.equal(rows[1].matrix_invite_ok, null);

        // A restart hydrates the claim, so the CAS still refuses a second one.
        const store2 = new PostgresBackedDb();
        await store2.init(pool as never);
        const hydrated = store2.findInvitationAdmission(
            claimed.invitationTokenId,
            claimed.matrixUserId
        );
        assert.equal(hydrated?.claimedByUserId, 'user-pg');
        assert.equal(store2.claimInvitationAdmission(claimed.id, 'user-pg'), undefined);
        assert.equal(
            store2.findInvitationAdmission(unclaimed.invitationTokenId, unclaimed.matrixUserId)
                ?.claimedByUserId,
            undefined
        );

        store2.deleteInvitationAdmissionsForUser('user-pg', '@pg-unclaimed:test.local');
        await store2.drain();
        const left = await pg.query('SELECT id FROM invitation_admissions');
        assert.equal(left.rows.length, 0);
    } finally {
        await pg.close?.();
    }
});
