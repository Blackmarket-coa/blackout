/**
 * Account creation refuses a username the homeserver already has, and the
 * invite token is checked before anything is created. The admin
 * `PUT /_synapse/admin/v2/users/{mxid}` both creates and updates, so
 * `registerUser` and `provisionBurner` look the account up first (only a 404
 * proceeds, any other answer fails closed) and treat a PUT that answers 200
 * ("modified", so it has already written to that account) as a collision
 * rather than a success. `/v1/auth/register` maps that collision to the same
 * `409 user_exists` a local name clash gives and rolls the local row back. The
 * answer says that the name is taken, but not whether it belongs to a Blackout
 * account or only to a homeserver account. A presented invite token is checked
 * up front so an unusable one creates nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';
delete process.env.REQUIRE_INVITE_TOKEN;

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const { matrixClient } = await import('../src/integrations/matrix-client');

const ADMIN_USER_RE = /\/_synapse\/admin\/v2\/users\/([^/?]+)$/;
const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

interface AdminUserCall {
    method: string;
    mxid: string;
}

/**
 * A controllable Synapse. The single-user admin endpoint answers from
 * `existing` (200 for a known mxid on GET, else 404) and creates with 201,
 * unless a test pins the lookup or the create status to model a failure or a
 * race. Every admin user call is recorded; mint and room calls get a bare 200.
 */
const installMatrix = (
    opts: { existing?: string[]; lookupStatus?: number; putStatus?: number } = {}
) => {
    const existing = new Set(opts.existing ?? []);
    const calls: AdminUserCall[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = (status: number, payload: unknown = {}) =>
            new Response(JSON.stringify(payload), {
                status,
                headers: { 'content-type': 'application/json' },
            });
        if (url.includes('/_matrix/client/v3/account/whoami')) {
            return body(200, { user_id: '@blackout:test.local' });
        }
        const match = ADMIN_USER_RE.exec(url);
        if (match) {
            const mxid = decodeURIComponent(match[1]);
            const method = (init?.method ?? 'GET').toUpperCase();
            calls.push({ method, mxid });
            if (method === 'PUT') {
                const status = opts.putStatus ?? (existing.has(mxid) ? 200 : 201);
                return body(status, { name: mxid });
            }
            if (opts.lookupStatus !== undefined) {
                return body(opts.lookupStatus, opts.lookupStatus === 200 ? { name: mxid } : {});
            }
            return existing.has(mxid)
                ? body(200, { name: mxid })
                : body(404, { errcode: 'M_NOT_FOUND' });
        }
        return body(200);
    }) as typeof fetch;
    return {
        calls,
        puts: () => calls.filter((c) => c.method === 'PUT'),
        lookups: () => calls.filter((c) => c.method === 'GET'),
    };
};

const register = (body: Record<string, unknown>) =>
    app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });

const strongPassword = 'Original-Pass-1234!';
let seq = 0;
const freshName = (prefix: string) => `${prefix}-${(seq += 1)}-${randomUUID().slice(0, 6)}`;

const withGate = async (run: () => Promise<void>) => {
    process.env.REQUIRE_INVITE_TOKEN = '1';
    try {
        await run();
    } finally {
        delete process.env.REQUIRE_INVITE_TOKEN;
    }
};

const mintInvitation = (overrides: Partial<{ maxUses: number; useCount: number }> = {}) => {
    const inviterId = randomUUID();
    db.createUser({
        id: inviterId,
        username: freshName('inviter'),
        email: `${inviterId.slice(0, 8)}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    const token = `inv-${randomUUID()}`;
    const record = db.createInvitationToken({
        id: randomUUID(),
        createdBy: inviterId,
        tokenHash: sha256(token),
        maxUses: overrides.maxUses ?? 1,
        useCount: overrides.useCount,
    });
    return { token, record, inviterId };
};

test('registering the name of an existing Matrix user with no Blackout row gets 409 and sends no create', async () => {
    const ghost = freshName('ghost');
    // The bot's own localpart is one such name, and must not be touched.
    const matrix = installMatrix({ existing: [`@${ghost}:test.local`, '@blackout:test.local'] });

    for (const username of [ghost, 'blackout']) {
        const res = await register({
            username,
            email: `${username}@example.com`,
            password: strongPassword,
        });
        assert.equal(res.status, 409, username);
        assert.equal(((await res.json()) as { code: string }).code, 'user_exists');
        assert.equal(db.findUserByUsername(username), undefined, `no Blackout row for ${username}`);
    }
    assert.deepEqual(matrix.puts(), [], 'the homeserver account is never written');
});

test('a garbage invite token with the gate on creates nothing and makes no Matrix call', async () => {
    const matrix = installMatrix();
    const username = freshName('gated');
    await withGate(async () => {
        const res = await register({
            username,
            email: `${username}@example.com`,
            password: strongPassword,
            inviteToken: 'not-a-real-token',
        });
        assert.equal(res.status, 400);
        const body = (await res.json()) as { code: string; reason?: string };
        assert.equal(body.code, 'invite_token_invalid');
        assert.equal(body.reason, 'invalid');
    });
    assert.equal(db.findUserByUsername(username), undefined, 'no Blackout row');
    assert.deepEqual(matrix.calls, [], 'no lookup and no create were attempted');
});

test('a create that answers 200 (a name that appeared after the lookup) is refused and rolled back', async () => {
    // Lookup says free (404), but the PUT reports a modified existing account.
    const matrix = installMatrix({ putStatus: 200 });
    const username = freshName('racer');
    const res = await register({
        username,
        email: `${username}@example.com`,
        password: strongPassword,
    });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code: string }).code, 'user_exists');
    assert.equal(db.findUserByUsername(username), undefined, 'the local row is rolled back');
    assert.equal(matrix.lookups().length, 1, 'the account was looked up');
    assert.equal(matrix.puts().length, 1, 'the create was attempted and its 200 caught');
});

test('a homeserver lookup that is neither 200 nor 404 fails closed, with no create', async () => {
    const matrix = installMatrix({ lookupStatus: 500 });
    const username = freshName('flaky');
    const res = await register({
        username,
        email: `${username}@example.com`,
        password: strongPassword,
    });
    assert.equal(res.status, 502);
    assert.equal(((await res.json()) as { code: string }).code, 'matrix_provisioning_failed');
    assert.equal(db.findUserByUsername(username), undefined);
    assert.deepEqual(matrix.puts(), [], 'no create after a failed lookup');
});

test('normal registration still works: one lookup, one create, a session', async () => {
    const matrix = installMatrix();
    const username = freshName('fresh');
    const res = await register({
        username,
        email: `${username}@example.com`,
        password: strongPassword,
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { token: string; userId: string };
    assert.ok(body.token, 'a session token is returned');
    assert.ok(db.findUserByUsername(username), 'the Blackout row exists');
    assert.equal(matrix.lookups().length, 1);
    assert.equal(matrix.puts().length, 1);
    assert.deepEqual(
        matrix.puts().map((c) => c.mxid),
        [`@${username}:test.local`]
    );
});

test('a usable invite token with the gate on registers once and consumes one use', async () => {
    installMatrix();
    const { token, record } = mintInvitation({ maxUses: 2 });
    const username = freshName('invited');
    await withGate(async () => {
        const res = await register({
            username,
            email: `${username}@example.com`,
            password: strongPassword,
            inviteToken: token,
        });
        assert.equal(res.status, 201);
        assert.equal(((await res.json()) as { invite?: { ok: boolean } }).invite?.ok, true);
    });
    assert.ok(db.findUserByUsername(username));
    assert.equal(db.getInvitationTokenById(record.id)?.useCount, 1);
});

// --- the client surface the route rests on ---

test('registerUser refuses an existing name and makes no create', async () => {
    const matrix = installMatrix({ existing: ['@taken:test.local'] });
    const outcome = await matrixClient.registerUser('taken', 'pw');
    assert.deepEqual(outcome, { ok: false, status: 409, reason: 'matrix_user_exists' });
    assert.deepEqual(matrix.puts(), []);
});

test('registerUser creates only on a 404 lookup + 201 create', async () => {
    const matrix = installMatrix();
    const outcome = await matrixClient.registerUser('brandnew', 'pw');
    assert.equal(outcome.ok, true);
    assert.equal(matrix.lookups().length, 1);
    assert.equal(matrix.puts().length, 1);
});

test('registerUser treats a 200 create (race) as a collision, not a success', async () => {
    installMatrix({ putStatus: 200 });
    const outcome = await matrixClient.registerUser('appeared', 'pw');
    assert.deepEqual(outcome, { ok: false, status: 409, reason: 'matrix_user_exists' });
});

test('registerUser fails closed when the lookup is neither 200 nor 404', async () => {
    const matrix = installMatrix({ lookupStatus: 503 });
    const outcome = await matrixClient.registerUser('whoknows', 'pw');
    assert.equal(outcome.ok, false);
    assert.equal('reason' in outcome && outcome.reason, 'matrix_user_lookup_failed');
    assert.deepEqual(matrix.puts(), []);
});

test('provisionBurner applies the same create-only guard', async () => {
    installMatrix({ putStatus: 200 });
    const raced = await matrixClient.provisionBurner('persona');
    assert.equal(raced.ok, false);
    assert.equal('reason' in raced && raced.reason, 'matrix_user_exists');

    const ok = installMatrix();
    const made = await matrixClient.provisionBurner('persona');
    assert.equal(made.ok, true);
    assert.equal(ok.lookups().length, 1);
    assert.equal(ok.puts().length, 1);
});
