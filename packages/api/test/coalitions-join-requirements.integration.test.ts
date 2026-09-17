/**
 * Founder-chosen join requirements.
 *
 * The behaviour being pinned is not "does the threshold compare correctly" —
 * it is that the platform imposes nothing, that nobody is refused, and above
 * all that an *unanswerable* requirement is distinguishable from an unmet one.
 * The bug this replaced could not tell them apart: FBM served no tier at all,
 * every member resolved to the floor, and so every coalition whose founder
 * picked any rung above it silently queued 100% of its joiners — including the
 * ones that had chosen open joining — while telling nobody.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { __setTierResolverForTests } = await import('../src/services/coalitionTierGate');
const { normalizeJoinRequirements } = await import('@blackout/core');

function auth(user: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, user, 600)}`,
        'content-type': 'application/json',
    };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `createUser` stamps `createdAt` itself and there is no generic user update,
 * so account age is set by mutating the stored record. The store is in memory
 * mode here and hands back the very object it holds, which makes that exact
 * rather than approximate — and age is the whole point of these cases.
 */
function ensureUser(id: string, ageDays: number, verified: boolean): void {
    if (!db.getUserById(id)) {
        db.createUser({
            id,
            username: id,
            email: `${id}@example.test`,
            passwordHash: 'hash',
            reputationScore: 0,
            reputationTier: 'member',
            pubkeyEd25519: `pk-${id}`,
        });
    }
    const user = db.getUserById(id);
    assert.ok(user, `fixture user ${id} missing`);
    user.createdAt = new Date(Date.now() - ageDays * DAY_MS).toISOString();
    if (verified) user.emailVerifiedAt = user.createdAt;
    else delete user.emailVerifiedAt;
}

const FOUNDER = 'req-founder';
const NEWCOMER = 'req-newcomer';
const VETERAN = 'req-veteran';

async function found(body: Record<string, unknown>) {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(FOUNDER),
        body: JSON.stringify({ name: 'Requirements', mission: 'Test the bar', ...body }),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return (JSON.parse(text) as { coalition: { id: string } }).coalition;
}

async function join(coalitionId: string, user: string) {
    const res = await app.request(`/v1/coalitions/${coalitionId}/join`, {
        method: 'POST',
        headers: auth(user),
    });
    const text = await res.text();
    return {
        status: res.status,
        body: JSON.parse(text) as {
            joined: boolean;
            reason?: string | null;
            unmet?: Array<{ key: string; met: boolean; unverified?: boolean }>;
        },
    };
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    __setTierResolverForTests(null);
    ensureUser(FOUNDER, 400, true);
    ensureUser(VETERAN, 400, true);
    ensureUser(NEWCOMER, 0, false);
});

// --- the default: the platform asks nothing --------------------------------

test('a coalition that sets no requirements admits on its join mode alone', async () => {
    const coalition = await found({ joinMode: 'open' });
    const outcome = await join(coalition.id, NEWCOMER);
    assert.equal(outcome.status, 200);
    assert.equal(outcome.body.joined, true, 'a brand-new account walks in');
});

// --- local requirements ----------------------------------------------------

test('an account-age bar queues the newcomer and admits the veteran', async () => {
    const coalition = await found({
        joinMode: 'open',
        joinRequirements: { minAccountAgeDays: 30 },
    });

    const queued = await join(coalition.id, NEWCOMER);
    assert.equal(queued.status, 202, 'queued, never refused');
    assert.equal(queued.body.joined, false);
    assert.deepEqual(
        queued.body.unmet?.map((u) => u.key),
        ['account_age']
    );
    assert.match(String(queued.body.reason), /30 days/, 'told which bar they missed');

    const admitted = await join(coalition.id, VETERAN);
    assert.equal(admitted.status, 200);
    assert.equal(admitted.body.joined, true);
});

test('a verified-email bar reads the real flag, not the presence of an address', async () => {
    const coalition = await found({
        joinMode: 'open',
        joinRequirements: { requireVerifiedEmail: true },
    });
    // NEWCOMER has an email address but has never confirmed it.
    const queued = await join(coalition.id, NEWCOMER);
    assert.equal(queued.body.joined, false);
    assert.deepEqual(
        queued.body.unmet?.map((u) => u.key),
        ['verified_email']
    );

    assert.equal((await join(coalition.id, VETERAN)).body.joined, true);
});

test('several requirements are additive and every failure is reported', async () => {
    const coalition = await found({
        joinMode: 'open',
        joinRequirements: {
            minAccountAgeDays: 30,
            requireVerifiedEmail: true,
            minCoalitionContributions: 2,
        },
    });
    const queued = await join(coalition.id, NEWCOMER);
    assert.equal(queued.body.joined, false);
    assert.deepEqual(queued.body.unmet?.map((u) => u.key).sort(), [
        'account_age',
        'contributions',
        'verified_email',
    ]);
});

// --- the tier: unanswerable is not unmet -----------------------------------

test('an unverifiable tier queues without telling anyone their standing is low', async () => {
    // This is the shipped state of the world: FBM serves no tier for a member
    // it cannot place, and previously that was indistinguishable from the
    // bottom rung.
    __setTierResolverForTests(async () => ({ known: false, reason: 'lookup_failed' }));
    const coalition = await found({ joinMode: 'open', minTierToJoin: 'canopy' });

    const queued = await join(coalition.id, VETERAN);
    assert.equal(queued.status, 202);
    assert.equal(queued.body.unmet?.[0]?.key, 'tier');
    assert.equal(queued.body.unmet?.[0]?.unverified, true, 'marked unverifiable');
    assert.match(
        String(queued.body.reason),
        /could not check/i,
        'reads as a referral to a steward, not a judgement'
    );
    assert.doesNotMatch(String(queued.body.reason), /canopy/, 'no claim about their rung');
});

test('a known tier below the bar says so plainly, and a known tier above it walks in', async () => {
    __setTierResolverForTests(async () => ({ known: true, tier: 'sprout' }));
    const coalition = await found({ joinMode: 'open', minTierToJoin: 'canopy' });

    const below = await join(coalition.id, VETERAN);
    assert.equal(below.body.joined, false);
    assert.equal(below.body.unmet?.[0]?.unverified, undefined, 'this one really is unmet');
    assert.match(String(below.body.reason), /canopy tier or above/);

    __setTierResolverForTests(async () => ({ known: true, tier: 'ancestor' }));
    const above = await join(coalition.id, NEWCOMER);
    assert.equal(above.body.joined, true);
});

test('no tier gate means no cross-service call at all', async () => {
    let calls = 0;
    __setTierResolverForTests(async () => {
        calls += 1;
        return { known: true, tier: 'ancestor' };
    });
    const coalition = await found({ joinMode: 'open', joinRequirements: { minAccountAgeDays: 1 } });
    await join(coalition.id, VETERAN);
    assert.equal(calls, 0, 'the common case does not pay for an HTTP hop');
});

// --- existing members are never re-checked ---------------------------------

test('raising the bar never evicts the members already in', async () => {
    const coalition = await found({ joinMode: 'open' });
    assert.equal((await join(coalition.id, NEWCOMER)).body.joined, true);

    const patched = await app.request(`/v1/coalitions/${coalition.id}`, {
        method: 'PATCH',
        headers: auth(FOUNDER),
        body: JSON.stringify({ joinRequirements: { minAccountAgeDays: 365 } }),
    });
    assert.equal(patched.status, 200, await patched.text());

    const view = (await (
        await app.request(`/v1/coalitions/${coalition.id}`, { headers: auth(FOUNDER) })
    ).json()) as { memberCount: number };
    assert.equal(view.memberCount, 2, 'admitted under the policy of their day');
});

// --- normalization ---------------------------------------------------------

test('nonsense thresholds are dropped, not clamped into something enforceable', () => {
    assert.equal(normalizeJoinRequirements({ minAccountAgeDays: 0 }), undefined);
    assert.equal(normalizeJoinRequirements({ minAccountAgeDays: -5 }), undefined);
    assert.equal(normalizeJoinRequirements({ minAccountAgeDays: Number.NaN }), undefined);
    assert.equal(normalizeJoinRequirements({ minAccountAgeDays: 1e9 }), undefined);
    assert.equal(normalizeJoinRequirements({ requireVerifiedEmail: false }), undefined);
    assert.equal(normalizeJoinRequirements({}), undefined);
    assert.deepEqual(normalizeJoinRequirements({ minAccountAgeDays: 30.9 }), {
        minAccountAgeDays: 30,
    });
});

test('clearing the requirements removes the bar entirely', async () => {
    const coalition = await found({
        joinMode: 'open',
        joinRequirements: { minAccountAgeDays: 365 },
    });
    assert.equal((await join(coalition.id, NEWCOMER)).body.joined, false);

    const cleared = await app.request(`/v1/coalitions/${coalition.id}`, {
        method: 'PATCH',
        headers: auth(FOUNDER),
        body: JSON.stringify({ joinRequirements: null }),
    });
    assert.equal(cleared.status, 200, await cleared.text());

    const after = (await (
        await app.request(`/v1/coalitions/${coalition.id}`, { headers: auth(FOUNDER) })
    ).json()) as { coalition: { joinRequirements?: unknown } };
    assert.equal(after.coalition.joinRequirements, undefined);
});
