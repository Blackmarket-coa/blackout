import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
// No FBM entitlements service configured, which is the common deployment shape.
delete process.env.FBM_ENTITLEMENTS_BASE_URL;
// Raise the per-user export budget so this file can exercise many cases. The
// limiter's real behaviour is asserted in data-export-rate-limit.integration.test.ts,
// which sets a low ceiling — the default of 5/min is otherwise low enough that
// this suite trips it partway through and later cases see 429s.
process.env.EXPORT_RATE_LIMIT_MAX = '500';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { followUser } = await import('../src/services/follows');

const USER_ID = randomUUID();
const OTHER_ID = randomUUID();

db.createUser({
    id: USER_ID,
    username: 'exporter',
    email: 'exporter@example.test',
    passwordHash: 'super-secret-hash',
    reputationScore: 10,
    reputationTier: 'member',
    pubkeyEd25519: 'pk-exporter',
});
db.createUser({
    id: OTHER_ID,
    username: 'other',
    email: 'other@example.test',
    passwordHash: 'another-secret-hash',
    reputationScore: 5,
    reputationTier: 'member',
    pubkeyEd25519: 'pk-other',
});

const headers = (userId: string, username: string) => ({
    authorization: `Bearer ${signJwt(userId, username, 600)}`,
});

const getExport = async (userId = USER_ID, username = 'exporter') =>
    app.request('/v1/data-export', { headers: headers(userId, username) });

test('requires authentication', async () => {
    const res = await app.request('/v1/data-export');
    assert.equal(res.status, 401);
});

test('returns a manifest, account, social graph and ledger for the caller', async () => {
    const res = await getExport();
    assert.equal(res.status, 200);

    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.manifest.schema, 'blackout.data-export.v1');
    assert.equal(body.manifest.userId, USER_ID);
    assert.ok(body.account, 'account section present');
    assert.ok(body.socialGraph, 'social graph section present');
    assert.ok(body.ledger, 'ledger section present');
});

test('is free — no entitlement check, unlike /transparency/audit-export', async () => {
    // The whole reason this endpoint exists. `audit-export` 402s below Coalition
    // tier; a paywalled export cannot back a data-portability claim, so this one
    // must stay ungated for a plain free-tier user.
    const gated = await app.request('/v1/transparency/audit-export', {
        headers: headers(USER_ID, 'exporter'),
    });
    assert.equal(gated.status, 402, 'precondition: the old export is still tier-gated');

    const free = await getExport();
    assert.equal(free.status, 200, 'the self-service export is not gated');
});

test('never includes credentials', async () => {
    const res = await getExport();
    const raw = await res.text();

    // Checked against the serialized payload rather than a field path, so a
    // credential leaking in via a nested record is caught too.
    assert.ok(!raw.includes('super-secret-hash'), 'password hash must not appear anywhere');
    assert.ok(!raw.includes('passwordHash'), 'password hash field must not appear');
});

test("does not leak the other user's data", async () => {
    // A social graph is shared by construction: exporting it must not become a
    // way to read out other people's records.
    followUser(OTHER_ID, USER_ID); // someone else follows the exporting user

    const res = await getExport();
    const body = (await res.json()) as Record<string, any>;
    const raw = JSON.stringify(body);

    assert.equal(body.socialGraph.follows.followerCount, 1, 'inbound edges are counted');
    assert.ok(!raw.includes('another-secret-hash'), "the other user's hash is absent");
    assert.ok(
        !raw.includes('other@example.test'),
        "the other user's email must not appear in a follower list"
    );
});

test('outbound follows are exported in full', async () => {
    followUser(USER_ID, OTHER_ID);

    const body = (await (await getExport()).json()) as Record<string, any>;
    const following = body.socialGraph.follows.following as Array<{ followeeId: string }>;
    assert.ok(
        following.some((edge) => edge.followeeId === OTHER_ID),
        'edges the user created are theirs to export'
    );
});

test('says plainly that encrypted message history is not included', async () => {
    // An export that silently omitted messages would read as data loss. The
    // omission is the encryption guarantee working, so the payload explains it.
    const body = (await (await getExport()).json()) as Record<string, any>;

    assert.equal(body.manifest.matrixHistory.included, false);
    assert.match(body.manifest.matrixHistory.reason, /end-to-end encrypted/i);
    assert.ok(
        body.manifest.matrixHistory.howToExport.length > 0,
        'and points the user at where they can get it'
    );
});

test('marks process-memory sections so an empty result is not read as "no data"', async () => {
    const body = (await (await getExport()).json()) as Record<string, any>;

    assert.equal(body.socialGraph.follows.durability, 'process-memory');
    assert.equal(body.socialGraph.profile.durability, 'process-memory');
    assert.equal(body.socialGraph.invitations.durability, 'persisted');
    assert.ok(
        body.socialGraph.warnings.some((w: string) => /process memory/i.test(w)),
        'the caveat travels in the payload, not only in the docs'
    );
});

test('reports an unconfigured ledger as unavailable rather than a zero balance', async () => {
    const body = (await (await getExport()).json()) as Record<string, any>;

    assert.equal(body.ledger.external.available, false);
    assert.equal(body.ledger.external.reason, 'not_configured');
    assert.equal(
        body.ledger.external.balanceMinorUnits,
        undefined,
        'no invented balance when the owning service is absent'
    );
    assert.ok(
        body.ledger.notes.some((n: string) => /hawala|KARMA|HRS/.test(n)),
        'states which ledger concepts do not exist rather than omitting them silently'
    );
});

test('local ledger records are exported', async () => {
    const now = new Date().toISOString();
    db.insertMigrationCredit({
        id: randomUUID(),
        userId: USER_ID,
        fbmCreditId: null,
        sourceKind: 'discord',
        sourceHandle: 'exporter#1',
        valueCents: 500,
        currency: 'USD',
        grantedAt: now,
        redeemedAt: null,
        createdAt: now,
        updatedAt: now,
    });

    const body = (await (await getExport()).json()) as Record<string, any>;
    const credits = body.ledger.local.migrationCredits as Array<{ valueCents: number }>;
    assert.ok(
        credits.some((credit) => credit.valueCents === 500),
        'locally-held credits are real data and are exported'
    );
});

test('download=1 sets an attachment filename, and exports are never cached', async () => {
    const plain = await getExport();
    assert.equal(plain.headers.get('content-disposition'), null);
    assert.equal(plain.headers.get('cache-control'), 'no-store');

    const download = await app.request('/v1/data-export?download=1', {
        headers: headers(USER_ID, 'exporter'),
    });
    assert.match(download.headers.get('content-disposition') ?? '', /^attachment; filename=/);
});

test('404s when the token outlives the account', async () => {
    const ghostId = randomUUID();
    const res = await app.request('/v1/data-export', { headers: headers(ghostId, 'ghost') });
    assert.equal(res.status, 404);
});
