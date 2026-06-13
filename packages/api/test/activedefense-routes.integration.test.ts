import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { applySubscriptionWebhookEvent } = await import('../src/services/subscriptions');

function makeUser(username: string): { id: string; token: string } {
    const id = randomUUID();
    db.createUser({
        id,
        username,
        email: `${username}@test.local`,
        passwordHash: 'x',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: '',
    });
    return { id, token: signJwt(id, username, 600) };
}

/** Activate canopy_pro → `enterprise` entitlement tier → active defense. */
function makeEnterpriseUser(username: string): { id: string; token: string } {
    const user = makeUser(username);
    applySubscriptionWebhookEvent({
        eventId: randomUUID(),
        type: 'invoice.paid',
        userId: user.id,
        planCode: 'canopy_pro_monthly',
    });
    return user;
}

const authJson = (token: string, body: unknown) => ({
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
});

test('POST /v1/activedefense/canary-tokens rejects unauthenticated callers', async () => {
    const res = await app.request('/v1/activedefense/canary-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'x', consent: true }),
    });
    assert.equal(res.status, 401);
});

test('POST /v1/activedefense/canary-tokens returns 402 for a non-enterprise caller', async () => {
    const user = makeUser(`free_${randomUUID().slice(0, 8)}`);
    const res = await app.request(
        '/v1/activedefense/canary-tokens',
        authJson(user.token, { label: 'honeypot', consent: true }),
    );
    assert.equal(res.status, 402);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.code, 'active_defense_not_entitled');
    assert.equal(body.suggestedTier, 'enterprise');
});

test('POST /v1/activedefense/canary-tokens returns 403 without explicit consent', async () => {
    const user = makeEnterpriseUser(`noconsent_${randomUUID().slice(0, 8)}`);
    const res = await app.request(
        '/v1/activedefense/canary-tokens',
        authJson(user.token, { label: 'honeypot' }),
    );
    assert.equal(res.status, 403);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.code, 'active_defense_consent_required');
});

test('enterprise caller can mint, list, and trip a canary token with consent', async () => {
    const user = makeEnterpriseUser(`canary_${randomUUID().slice(0, 8)}`);

    const mint = await app.request(
        '/v1/activedefense/canary-tokens',
        authJson(user.token, { label: 'db-honeypot', consent: true }),
    );
    assert.equal(mint.status, 201);
    const minted = (await mint.json()) as Record<string, any>;
    assert.match(minted.canary.token, /^bo-canary-[0-9a-f]{32}$/);
    assert.equal(minted.canary.tripCount, 0);

    const list = await app.request('/v1/activedefense/canary-tokens', {
        headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(list.status, 200);
    const listed = (await list.json()) as Record<string, any>;
    assert.equal(listed.canaries.length, 1);

    const trip = await app.request(
        '/v1/activedefense/canary-tokens/trip',
        authJson(user.token, { token: minted.canary.token }),
    );
    assert.equal(trip.status, 200);
    const tripped = (await trip.json()) as Record<string, any>;
    assert.equal(tripped.canary.tripCount, 1);
    assert.ok(tripped.canary.lastTrippedAt);
});

test('POST /v1/activedefense/decoy-data returns synthetic records for entitled callers', async () => {
    const user = makeEnterpriseUser(`decoy_${randomUUID().slice(0, 8)}`);
    const res = await app.request(
        '/v1/activedefense/decoy-data',
        authJson(user.token, { kind: 'contact', count: 3, consent: true }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.count, 3);
    assert.equal(body.records.length, 3);
    assert.ok(body.records.every((r: any) => r.synthetic === true && r.kind === 'contact'));
});

test('POST /v1/activedefense/decoy-data returns 402 for a non-enterprise caller', async () => {
    const user = makeUser(`nodec_${randomUUID().slice(0, 8)}`);
    const res = await app.request(
        '/v1/activedefense/decoy-data',
        authJson(user.token, { kind: 'message', consent: true }),
    );
    assert.equal(res.status, 402);
});

test('public tripwire GET /ct/:token records a trip and returns a 1x1 gif (no auth)', async () => {
    const owner = makeEnterpriseUser(`trip_${randomUUID().slice(0, 8)}`);
    const mint = await app.request(
        '/v1/activedefense/canary-tokens',
        authJson(owner.token, { label: 'doc-honeypot', consent: true }),
    );
    const { canary } = (await mint.json()) as Record<string, any>;

    // Unauthenticated access to the tripwire (as an attacker opening a honeypot).
    const hit = await app.request(`/ct/${canary.token}`, {
        headers: { 'user-agent': 'EvilCrawler/9.9' },
    });
    assert.equal(hit.status, 200);
    assert.equal(hit.headers.get('content-type'), 'image/gif');

    // The owner sees the trip recorded with attribution.
    const list = await app.request('/v1/activedefense/canary-tokens', {
        headers: { authorization: `Bearer ${owner.token}` },
    });
    const { canaries } = (await list.json()) as Record<string, any>;
    const updated = canaries.find((x: any) => x.token === canary.token);
    assert.equal(updated.tripCount, 1);
    assert.ok(updated.lastTrippedAt);
    assert.equal(updated.lastTripUserAgent, 'EvilCrawler/9.9');
});

test('public tripwire returns the same 1x1 gif for an unknown token (no enumeration)', async () => {
    const res = await app.request('/ct/bo-canary-does-not-exist');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/gif');
});
