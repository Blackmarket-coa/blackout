import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.FREEBLACKMARKET_BASE_URL =
    process.env.FREEBLACKMARKET_BASE_URL ?? 'https://api.freeblackmarket.test';
process.env.FREEBLACKMARKET_API_KEY = process.env.FREEBLACKMARKET_API_KEY ?? 'test-api-key';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET =
    process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? 'test-webhook-secret';
process.env.FREEBLACKMARKET_STUB = process.env.FREEBLACKMARKET_STUB ?? '1';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.BLACKOUT_ADMIN_API_KEY = process.env.BLACKOUT_ADMIN_API_KEY ?? 'test-admin-key';

const WEBHOOK_SECRET = process.env.FREEBLACKMARKET_WEBHOOK_SECRET!;
const ADMIN_KEY = 'test-admin-key';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { resetCommunityBoostsForTest } = await import('../src/services/communityBoosts');
const { resetMarketplaceEntitlementsForTest } = await import(
    '../src/services/marketplaceEntitlements'
);

const COMMUNITY_ID = 'phase3-community-1';
const PLEDGER_A = 'phase3-pledger-a';
const PLEDGER_B = 'phase3-pledger-b';

function ensureUser(id: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username: id,
        email: `${id}@blackout.test`,
        passwordHash: 'test-hash',
        reputationScore: 100,
        reputationTier: 'member',
        pubkeyEd25519: `${id}-pubkey`,
    });
}

function headersFor(id: string): Record<string, string> {
    ensureUser(id);
    return {
        authorization: `Bearer ${signJwt(id, id, 600)}`,
        'content-type': 'application/json',
    };
}

function adminHeaders(): Record<string, string> {
    return { 'content-type': 'application/json', 'x-admin-api-key': ADMIN_KEY };
}

function setup(): void {
    resetCommunityBoostsForTest();
    resetMarketplaceEntitlementsForTest();
    ensureUser(PLEDGER_A);
    ensureUser(PLEDGER_B);
}

interface PledgeBody {
    id: string;
    communityId: string;
    pledgerUserId: string;
    monthlyCents: number;
    feeCents: number;
    netCents: number;
    status: 'pending' | 'active' | 'canceled' | 'refunded' | 'expired';
    currentPeriodEndsAt: string | null;
}

async function pledge(userId: string, monthlyCents = 500): Promise<PledgeBody> {
    const r = await app.request('/v1/community-boosts/pledge', {
        method: 'POST',
        headers: headersFor(userId),
        body: JSON.stringify({ communityId: COMMUNITY_ID, monthlyCents, currency: 'USD' }),
    });
    assert.equal(r.status, 201);
    const { pledge } = (await r.json()) as { pledge: PledgeBody };
    return pledge;
}

async function capture(pledgeId: string): Promise<PledgeBody> {
    const r = await app.request(`/v1/community-boosts/pledges/${pledgeId}/capture`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({}),
    });
    assert.equal(r.status, 200);
    const { pledge } = (await r.json()) as { pledge: PledgeBody };
    return pledge;
}

test('POST /v1/community-boosts/pledge records a 3% split and returns pending status', async () => {
    setup();
    const p = await pledge(PLEDGER_A, 500);
    assert.equal(p.status, 'pending');
    assert.equal(p.monthlyCents, 500);
    assert.equal(p.feeCents, 15);
    assert.equal(p.netCents, 485);
    assert.equal(p.communityId, COMMUNITY_ID);
});

test('POST /v1/community-boosts/pledge rejects below-floor amounts', async () => {
    setup();
    const r = await app.request('/v1/community-boosts/pledge', {
        method: 'POST',
        headers: headersFor(PLEDGER_A),
        body: JSON.stringify({ communityId: COMMUNITY_ID, monthlyCents: 100, currency: 'USD' }),
    });
    assert.equal(r.status, 400);
});

test('POST /v1/community-boosts/pledge rejects a second active pledge from the same user', async () => {
    setup();
    const first = await pledge(PLEDGER_A);
    await capture(first.id);
    const r = await app.request('/v1/community-boosts/pledge', {
        method: 'POST',
        headers: headersFor(PLEDGER_A),
        body: JSON.stringify({ communityId: COMMUNITY_ID, monthlyCents: 999, currency: 'USD' }),
    });
    assert.equal(r.status, 409);
    const body = (await r.json()) as { code: string };
    assert.equal(body.code, 'already_pledged');
});

test('boost level rises with active-pledge count and resets on cancel/refund', async () => {
    setup();
    // 0 active -> level 0
    let stateR = await app.request(`/v1/community-boosts/communities/${COMMUNITY_ID}/state`, {
        method: 'GET',
    });
    let state = (await stateR.json()) as { boostLevel: number; activePledgeCount: number };
    assert.equal(state.boostLevel, 0);
    assert.equal(state.activePledgeCount, 0);

    // 1 active -> still level 0 (threshold is 2)
    const p1 = await pledge(PLEDGER_A);
    await capture(p1.id);
    stateR = await app.request(`/v1/community-boosts/communities/${COMMUNITY_ID}/state`, {
        method: 'GET',
    });
    state = (await stateR.json()) as { boostLevel: number; activePledgeCount: number };
    assert.equal(state.activePledgeCount, 1);
    assert.equal(state.boostLevel, 0);

    // 2 active -> level 1
    const p2 = await pledge(PLEDGER_B);
    await capture(p2.id);
    stateR = await app.request(`/v1/community-boosts/communities/${COMMUNITY_ID}/state`, {
        method: 'GET',
    });
    state = (await stateR.json()) as { boostLevel: number; activePledgeCount: number };
    assert.equal(state.activePledgeCount, 2);
    assert.equal(state.boostLevel, 1);

    // Cancel one -> back to level 0
    await app.request(`/v1/community-boosts/pledges/${p1.id}/cancel`, {
        method: 'POST',
        headers: headersFor(PLEDGER_A),
    });
    stateR = await app.request(`/v1/community-boosts/communities/${COMMUNITY_ID}/state`, {
        method: 'GET',
    });
    state = (await stateR.json()) as { boostLevel: number; activePledgeCount: number };
    assert.equal(state.activePledgeCount, 1);
    assert.equal(state.boostLevel, 0);
});

test('cancel rejects requests by anyone other than the pledger (403 forbidden)', async () => {
    setup();
    const p = await pledge(PLEDGER_A);
    await capture(p.id);
    const r = await app.request(`/v1/community-boosts/pledges/${p.id}/cancel`, {
        method: 'POST',
        headers: headersFor(PLEDGER_B),
    });
    assert.equal(r.status, 403);
});

test('marketplace webhook with metadata.boostPledgeId activates a pending pledge', async () => {
    setup();
    const p = await pledge(PLEDGER_A);
    const eventBody = JSON.stringify({
        eventId: 'evt-boost-1',
        type: 'purchase.succeeded',
        userId: PLEDGER_A,
        providerListingId: 'fbm-boost-listing',
        sku: null,
        kind: 'subscription_tier',
        occurredAt: new Date().toISOString(),
        metadata: { boostPledgeId: p.id, fbmSubscriptionId: 'fbm-boost-sub' },
    });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(eventBody).digest('hex');
    const r = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-boost-1',
            'x-fbm-signature': sig,
        },
        body: eventBody,
    });
    assert.equal(r.status, 200);

    const stateR = await app.request(`/v1/community-boosts/communities/${COMMUNITY_ID}/state`, {
        method: 'GET',
    });
    const state = (await stateR.json()) as { activePledgeCount: number };
    assert.equal(state.activePledgeCount, 1);
});

test('marketplace webhook refund flips an active pledge to refunded and drops the level', async () => {
    setup();
    const p1 = await pledge(PLEDGER_A);
    const p2 = await pledge(PLEDGER_B);
    await capture(p1.id);
    await capture(p2.id);

    let stateR = await app.request(`/v1/community-boosts/communities/${COMMUNITY_ID}/state`, {
        method: 'GET',
    });
    let state = (await stateR.json()) as { boostLevel: number };
    assert.equal(state.boostLevel, 1);

    const refundBody = JSON.stringify({
        eventId: 'evt-boost-refund',
        type: 'purchase.refunded',
        userId: PLEDGER_A,
        providerListingId: 'fbm-boost-listing',
        sku: null,
        kind: 'subscription_tier',
        occurredAt: new Date().toISOString(),
        metadata: { boostPledgeId: p1.id },
    });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(refundBody).digest('hex');
    await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-boost-refund',
            'x-fbm-signature': sig,
        },
        body: refundBody,
    });

    stateR = await app.request(`/v1/community-boosts/communities/${COMMUNITY_ID}/state`, {
        method: 'GET',
    });
    state = (await stateR.json()) as { boostLevel: number; activePledgeCount: number };
    assert.equal(state.boostLevel, 0);
});

test('GET /v1/roles/me returns role grants from active marketplace_entitlements rows', async () => {
    setup();
    const eventBody = JSON.stringify({
        eventId: 'evt-role-grant',
        type: 'purchase.succeeded',
        userId: PLEDGER_A,
        providerListingId: 'role-supporter-listing',
        sku: null,
        kind: 'role_grant',
        occurredAt: new Date().toISOString(),
        metadata: { roleId: 'supporter', communityId: COMMUNITY_ID },
    });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(eventBody).digest('hex');
    await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-role-grant',
            'x-fbm-signature': sig,
        },
        body: eventBody,
    });

    const r = await app.request('/v1/roles/me', { method: 'GET', headers: headersFor(PLEDGER_A) });
    const { roles } = (await r.json()) as {
        roles: Array<{ roleId: string | null; communityId: string | null; listingId: string }>;
    };
    assert.equal(roles.length, 1);
    assert.equal(roles[0]!.roleId, 'supporter');
    assert.equal(roles[0]!.communityId, COMMUNITY_ID);

    const checkScoped = await app.request(
        `/v1/roles/me/has/supporter?communityId=${COMMUNITY_ID}`,
        { method: 'GET', headers: headersFor(PLEDGER_A) }
    );
    const scoped = (await checkScoped.json()) as { hasRole: boolean };
    assert.equal(scoped.hasRole, true);

    const checkOtherCommunity = await app.request(
        `/v1/roles/me/has/supporter?communityId=other`,
        { method: 'GET', headers: headersFor(PLEDGER_A) }
    );
    const otherC = (await checkOtherCommunity.json()) as { hasRole: boolean };
    assert.equal(otherC.hasRole, false);
});

test('GET /v1/channel-access/:channelId reflects entitlement metadata.channelId', async () => {
    setup();
    const channelId = 'paid-voice-room-1';
    const eventBody = JSON.stringify({
        eventId: 'evt-chan-grant',
        type: 'purchase.succeeded',
        userId: PLEDGER_A,
        providerListingId: 'channel-pass-listing',
        sku: null,
        kind: 'channel_access',
        occurredAt: new Date().toISOString(),
        metadata: { channelId },
    });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(eventBody).digest('hex');
    await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-chan-grant',
            'x-fbm-signature': sig,
        },
        body: eventBody,
    });

    const r = await app.request(`/v1/channel-access/${channelId}`, {
        method: 'GET',
        headers: headersFor(PLEDGER_A),
    });
    const body = (await r.json()) as { canAccess: boolean };
    assert.equal(body.canAccess, true);

    const noAccess = await app.request(`/v1/channel-access/${channelId}`, {
        method: 'GET',
        headers: headersFor(PLEDGER_B),
    });
    const noBody = (await noAccess.json()) as { canAccess: boolean };
    assert.equal(noBody.canAccess, false);
});

test('GET /v1/community-boosts/communities/:id/state reports nextThreshold and pledgesUntilNextLevel', async () => {
    setup();
    const p1 = await pledge(PLEDGER_A);
    await capture(p1.id);

    const r = await app.request(`/v1/community-boosts/communities/${COMMUNITY_ID}/state`, {
        method: 'GET',
    });
    const state = (await r.json()) as {
        boostLevel: number;
        activePledgeCount: number;
        nextThreshold: number | null;
        pledgesUntilNextLevel: number | null;
    };
    assert.equal(state.activePledgeCount, 1);
    assert.equal(state.boostLevel, 0);
    assert.equal(state.nextThreshold, 2);
    assert.equal(state.pledgesUntilNextLevel, 1);
});
