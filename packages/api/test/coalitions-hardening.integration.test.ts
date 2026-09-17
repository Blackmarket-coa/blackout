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
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS =
    process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS ??
    'test:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { computeBoostMeter } = await import('@blackout/core');
const { __resetCoalitionsForTests, requestJoin, listJoinRequests } = await import(
    '../src/services/coalitionNetworkStore'
);
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { __setTierResolverForTests } = await import('../src/services/coalitionTierGate');
const { connectPlatform, linkMemberAccount } = await import('../src/services/coalitionSync');

function auth(user: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, user, 600)}`,
        'content-type': 'application/json',
    };
}

function ensureUser(id: string): void {
    if (db.getUserById(id)) return;
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

const LEAD = 'hard-lead';
const JOINER = 'hard-joiner';
for (const id of [LEAD, JOINER]) ensureUser(id);

async function foundCoalition(name: string, body: Record<string, unknown> = {}) {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name, mission: 'Hold the line', ...body }),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return (JSON.parse(text) as { coalition: { id: string } }).coalition;
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    __setTierResolverForTests(null);
    delete process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED;
});

// --- boost meter -----------------------------------------------------------

test('boosting a campaign never ranks it below one nobody has boosted', () => {
    const now = '2026-09-16T12:00:00.000Z';
    const day = (iso: string) => iso.slice(0, 10);
    const today = day(now);
    const yesterday = '2026-09-15';

    const never = computeBoostMeter([], now);
    const decayed = computeBoostMeter(
        [
            { userId: 'a', day: yesterday },
            { userId: 'b', day: yesterday },
            { userId: 'c', day: yesterday },
        ],
        now
    );
    assert.equal(never.visibilityMultiplier, 1);
    assert.ok(
        decayed.visibilityMultiplier >= never.visibilityMultiplier,
        `decayed ${decayed.visibilityMultiplier} must not sink below ${never.visibilityMultiplier}`
    );

    // And momentum still lifts: boosts today beat the same count yesterday.
    const surging = computeBoostMeter(
        [
            { userId: 'a', day: today },
            { userId: 'b', day: today },
            { userId: 'c', day: today },
        ],
        now
    );
    assert.ok(surging.visibilityMultiplier > decayed.visibilityMultiplier);
});

test('a campaign whose boosts are all stale never outranks one boosted yesterday', () => {
    const now = '2026-09-16T12:00:00.000Z';
    const stale = computeBoostMeter(
        Array.from({ length: 100 }, (_, i) => ({ userId: `u${i}`, day: '2026-09-01' })),
        now
    );
    const recent = computeBoostMeter(
        Array.from({ length: 100 }, (_, i) => ({ userId: `u${i}`, day: '2026-09-15' })),
        now
    );
    assert.ok(stale.visibilityMultiplier <= recent.visibilityMultiplier);
});

// --- tier gate -------------------------------------------------------------

test('an unmet tier files a steward request instead of locking the coalition', async () => {
    // The shipped resolver could not read a tier at all, so this is the state
    // every real member was in: unplaceable, and previously refused outright.
    __setTierResolverForTests(async () => ({ known: true, tier: 'seedling' }));
    const coalition = await foundCoalition('Gated', { minTierToJoin: 'canopy' });

    const outcome = await requestJoin(coalition.id, JOINER, 'let me in');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.ok && outcome.value.joined, false, 'not admitted outright');

    const queue = listJoinRequests(coalition.id, LEAD);
    assert.equal(queue.ok, true);
    assert.equal(queue.ok && queue.value.length, 1, 'a human can still decide');
});

// --- credential intake -----------------------------------------------------

test('a shared platform secret is refused while outbound sync is off', () => {
    const outcome = connectPlatform('x', LEAD, {
        platform: 'discord',
        authMode: 'shared',
        secret: 'https://discord.com/api/webhooks/1/abc',
    });
    assert.equal(outcome.ok, false);
});

test('credential intake is refused on a real coalition while the gate is off', async () => {
    const coalition = await foundCoalition('Loud');
    const shared = connectPlatform(coalition.id, LEAD, {
        platform: 'discord',
        authMode: 'shared',
        secret: 'https://discord.com/api/webhooks/1/abc',
    });
    assert.equal(shared.ok, false);
    assert.equal(shared.ok === false && shared.error.kind, 'disabled');
    assert.equal(db.getCoalitionConnection(coalition.id, 'discord'), undefined);

    // A connection with no secret still works — share-link mode runs on it.
    const linkOnly = connectPlatform(coalition.id, LEAD, {
        platform: 'discord',
        authMode: 'shared',
    });
    assert.equal(linkOnly.ok, true);

    const personal = linkMemberAccount(coalition.id, LEAD, 'discord', 'tok');
    assert.equal(personal.ok, false);
});

test('a stored shared credential round-trips once the gate is on', async () => {
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED = '1';
    const { decryptSecret } = await import('../src/services/secretBox');
    const coalition = await foundCoalition('Wired');
    const secret = 'https://discord.com/api/webhooks/1/abc';
    const outcome = connectPlatform(coalition.id, LEAD, {
        platform: 'discord',
        authMode: 'shared',
        secret,
    });
    assert.equal(outcome.ok, true);

    const row = db.getCoalitionConnection(coalition.id, 'discord');
    assert.ok(row?.credentialRef);
    // The envelope was previously double-prefixed with its own key id, which
    // made every stored credential permanently unreadable and unrevocable.
    assert.equal(
        decryptSecret(row!.credentialRef as string, {
            aad: `coalition_connection:${coalition.id}:discord`,
        }),
        secret
    );
});

// --- contribution -----------------------------------------------------------

test('a drive with no listing records no debt and does not answer 201', async () => {
    const coalition = await foundCoalition('Unfunded');
    const created = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'drive', title: 'Coats', goalCents: 10_000 }),
    });
    const campaign = ((await created.json()) as { campaign: { id: string } }).campaign;

    const before = db.listTipsBySender(JOINER).length;
    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
        { method: 'POST', headers: auth(JOINER), body: JSON.stringify({ amountCents: 2_500 }) }
    );
    assert.equal(res.status, 503, await res.text());
    assert.equal(
        db.listTipsBySender(JOINER).length,
        before,
        'no uncollectable obligation is written'
    );
});

test('a campaign cannot be pointed at a caller-supplied FBM listing', async () => {
    const coalition = await foundCoalition('Redirect');
    const res = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({
            type: 'drive',
            title: 'Coats',
            goalCents: 10_000,
            fbmListingId: 'someone-elses-listing',
        }),
    });
    const campaign = ((await res.json()) as { campaign: { id: string; fbmListingId?: string } })
        .campaign;
    assert.equal(campaign.fbmListingId, undefined, 'the field is not client-writable');
});
