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
const { resetCreatorSubscriptionsForTest, hasActiveCreatorSubscription } = await import(
    '../src/services/creatorSubscriptions'
);
const { resetTipsForTest } = await import('../src/services/tips');
const { resetMarketplaceEntitlementsForTest } = await import(
    '../src/services/marketplaceEntitlements'
);

const CREATOR_ID = 'creator-cs-1';
const CREATOR_NAME = 'creator-cs';
const FAN_ID = 'fan-cs-1';
const FAN_NAME = 'fan-cs';

function ensureUser(id: string, username: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username,
        email: `${username}@blackout.test`,
        passwordHash: 'test-hash',
        reputationScore: 100,
        reputationTier: 'member',
        pubkeyEd25519: `${id}-pubkey`,
    });
}

function headersFor(id: string, username: string): Record<string, string> {
    ensureUser(id, username);
    return {
        authorization: `Bearer ${signJwt(id, username, 600)}`,
        'content-type': 'application/json',
    };
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { 'content-type': 'application/json', 'x-admin-api-key': ADMIN_KEY, ...extra };
}

function setup(): void {
    resetCreatorSubscriptionsForTest();
    resetTipsForTest();
    resetMarketplaceEntitlementsForTest();
    ensureUser(CREATOR_ID, CREATOR_NAME);
    ensureUser(FAN_ID, FAN_NAME);
}

interface TierBody {
    id: string;
    creatorUserId: string;
    name: string;
    priceCents: number;
    feeCents: number;
    netCents: number;
    status: 'draft' | 'active' | 'archived';
    fbmListingId: string | null;
}

interface SubBody {
    id: string;
    subscriberUserId: string;
    creatorUserId: string;
    tierId: string;
    status: 'pending' | 'active' | 'canceled' | 'refunded' | 'expired';
    startedAt: string | null;
    currentPeriodEndsAt: string | null;
}

async function createTier(priceCents = 999): Promise<TierBody> {
    const r = await app.request('/v1/creator-subs/me/tiers', {
        method: 'POST',
        headers: headersFor(CREATOR_ID, CREATOR_NAME),
        body: JSON.stringify({ name: 'Supporter', priceCents, currency: 'USD' }),
    });
    assert.equal(r.status, 201);
    const { tier } = (await r.json()) as { tier: TierBody };
    return tier;
}

test('POST /v1/creator-subs/me/tiers creates a tier with 3% commission preview', async () => {
    setup();
    const tier = await createTier(1000);
    assert.equal(tier.priceCents, 1000);
    assert.equal(tier.feeCents, 30);
    assert.equal(tier.netCents, 970);
    assert.equal(tier.status, 'active');
    assert.ok(tier.fbmListingId, 'tier should have an FBM listing id from the stub');
});

test('POST /v1/creator-subs/me/tiers rejects below-floor prices (< 199 cents)', async () => {
    setup();
    const r = await app.request('/v1/creator-subs/me/tiers', {
        method: 'POST',
        headers: headersFor(CREATOR_ID, CREATOR_NAME),
        body: JSON.stringify({ name: 'Cheap', priceCents: 100, currency: 'USD' }),
    });
    assert.equal(r.status, 400);
});

test('GET /v1/creator-subs/me/tiers lists creator-owned tiers ordered by price', async () => {
    setup();
    await createTier(199);
    await createTier(2999);
    await createTier(999);
    const r = await app.request('/v1/creator-subs/me/tiers', {
        method: 'GET',
        headers: headersFor(CREATOR_ID, CREATOR_NAME),
    });
    assert.equal(r.status, 200);
    const { tiers } = (await r.json()) as { tiers: TierBody[] };
    assert.equal(tiers.length, 3);
    assert.deepEqual(
        tiers.map((t) => t.priceCents),
        [199, 999, 2999]
    );
});

test('DELETE /v1/creator-subs/me/tiers/:id archives a tier', async () => {
    setup();
    const tier = await createTier(999);
    const r = await app.request(`/v1/creator-subs/me/tiers/${tier.id}`, {
        method: 'DELETE',
        headers: headersFor(CREATOR_ID, CREATOR_NAME),
    });
    assert.equal(r.status, 200);
    const { tier: archived } = (await r.json()) as { tier: TierBody };
    assert.equal(archived.status, 'archived');
});

test('POST /v1/creator-subs/subscribe creates a pending subscription', async () => {
    setup();
    const tier = await createTier(999);
    const r = await app.request('/v1/creator-subs/subscribe', {
        method: 'POST',
        headers: headersFor(FAN_ID, FAN_NAME),
        body: JSON.stringify({ tierId: tier.id }),
    });
    assert.equal(r.status, 201);
    const { subscription } = (await r.json()) as { subscription: SubBody };
    assert.equal(subscription.status, 'pending');
    assert.equal(subscription.subscriberUserId, FAN_ID);
    assert.equal(subscription.creatorUserId, CREATOR_ID);
    assert.equal(subscription.tierId, tier.id);
    assert.equal(subscription.startedAt, null);
});

test('POST /v1/creator-subs/subscribe blocks self-subscription', async () => {
    setup();
    const tier = await createTier(999);
    const r = await app.request('/v1/creator-subs/subscribe', {
        method: 'POST',
        headers: headersFor(CREATOR_ID, CREATOR_NAME),
        body: JSON.stringify({ tierId: tier.id }),
    });
    assert.equal(r.status, 400);
    const body = (await r.json()) as { code: string };
    assert.equal(body.code, 'self_subscribe_forbidden');
});

test('POST /v1/creator-subs/subscriptions/:id/capture activates a pending sub', async () => {
    setup();
    const tier = await createTier(999);
    const sub = await app.request('/v1/creator-subs/subscribe', {
        method: 'POST',
        headers: headersFor(FAN_ID, FAN_NAME),
        body: JSON.stringify({ tierId: tier.id }),
    }).then((r) => r.json() as Promise<{ subscription: SubBody }>);

    const r = await app.request(`/v1/creator-subs/subscriptions/${sub.subscription.id}/capture`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ fbmSubscriptionId: 'fbm-sub-xyz' }),
    });
    assert.equal(r.status, 200);
    const { subscription } = (await r.json()) as { subscription: SubBody };
    assert.equal(subscription.status, 'active');
    assert.ok(subscription.startedAt, 'startedAt should be set');
    assert.ok(subscription.currentPeriodEndsAt, 'currentPeriodEndsAt should be set');
    assert.ok(
        new Date(subscription.currentPeriodEndsAt!).getTime() > Date.now() + 25 * 24 * 3600 * 1000,
        'period should be ~30 days out'
    );
    assert.ok(hasActiveCreatorSubscription(FAN_ID, CREATOR_ID));
});

test('POST /v1/creator-subs/subscribe rejects when subscriber already has an active sub', async () => {
    setup();
    const tier = await createTier(999);
    const first = await app.request('/v1/creator-subs/subscribe', {
        method: 'POST',
        headers: headersFor(FAN_ID, FAN_NAME),
        body: JSON.stringify({ tierId: tier.id }),
    }).then((r) => r.json() as Promise<{ subscription: SubBody }>);
    await app.request(`/v1/creator-subs/subscriptions/${first.subscription.id}/capture`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({}),
    });

    const second = await app.request('/v1/creator-subs/subscribe', {
        method: 'POST',
        headers: headersFor(FAN_ID, FAN_NAME),
        body: JSON.stringify({ tierId: tier.id }),
    });
    assert.equal(second.status, 409);
    const body = (await second.json()) as { code: string };
    assert.equal(body.code, 'already_active');
});

test('POST /v1/creator-subs/subscriptions/:id/cancel transitions active → canceled (subscriber-only)', async () => {
    setup();
    const tier = await createTier(999);
    const sub = await app.request('/v1/creator-subs/subscribe', {
        method: 'POST',
        headers: headersFor(FAN_ID, FAN_NAME),
        body: JSON.stringify({ tierId: tier.id }),
    }).then((r) => r.json() as Promise<{ subscription: SubBody }>);
    await app.request(`/v1/creator-subs/subscriptions/${sub.subscription.id}/capture`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({}),
    });

    const r = await app.request(`/v1/creator-subs/subscriptions/${sub.subscription.id}/cancel`, {
        method: 'POST',
        headers: headersFor(FAN_ID, FAN_NAME),
    });
    assert.equal(r.status, 200);
    const { subscription } = (await r.json()) as { subscription: SubBody };
    assert.equal(subscription.status, 'canceled');
    assert.ok(!hasActiveCreatorSubscription(FAN_ID, CREATOR_ID));
});

test('marketplace webhook with metadata.tipId routes to captureTip and skips entitlement grant', async () => {
    setup();
    // Pre-create the pending tip we expect the webhook to capture.
    const tipResponse = await app.request('/v1/tips', {
        method: 'POST',
        headers: headersFor(FAN_ID, FAN_NAME),
        body: JSON.stringify({
            recipientUserId: CREATOR_ID,
            contextKind: 'profile',
            grossCents: 500,
            currency: 'USD',
        }),
    });
    assert.equal(tipResponse.status, 201);
    const { tip } = (await tipResponse.json()) as { tip: { id: string; status: string } };

    const eventBody = JSON.stringify({
        eventId: 'evt-tip-1',
        type: 'purchase.succeeded',
        userId: FAN_ID,
        providerListingId: 'fbm-tip-listing',
        sku: null,
        kind: 'asset_bundle',
        occurredAt: new Date().toISOString(),        metadata: { tipId: tip.id, fbmOrderId: 'fbm-order-from-webhook' },
    });
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(eventBody).digest('hex');

    const webhookResponse = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-tip-1',
            'x-fbm-signature': signature,
        },
        body: eventBody,
    });
    assert.equal(webhookResponse.status, 200);

    const fetched = await app.request(`/v1/tips/${tip.id}`, {
        method: 'GET',
        headers: headersFor(FAN_ID, FAN_NAME),
    });
    const { tip: capturedTip } = (await fetched.json()) as { tip: { status: string; fbmOrderId: string | null } };
    assert.equal(capturedTip.status, 'captured');
    assert.equal(capturedTip.fbmOrderId, 'fbm-order-from-webhook');
});

test('marketplace webhook with metadata.creatorSubscriptionId activates the subscription', async () => {
    setup();
    const tier = await createTier(999);
    const sub = await app.request('/v1/creator-subs/subscribe', {
        method: 'POST',
        headers: headersFor(FAN_ID, FAN_NAME),
        body: JSON.stringify({ tierId: tier.id }),
    }).then((r) => r.json() as Promise<{ subscription: SubBody }>);

    const eventBody = JSON.stringify({
        eventId: 'evt-sub-1',
        type: 'purchase.succeeded',
        userId: FAN_ID,
        providerListingId: tier.fbmListingId ?? 'fbm-tier-listing',
        sku: null,
        kind: 'subscription_tier',
        occurredAt: new Date().toISOString(),
        metadata: { creatorSubscriptionId: sub.subscription.id, fbmSubscriptionId: 'fbm-sub-from-webhook' },
    });
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(eventBody).digest('hex');

    const webhookResponse = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-sub-1',
            'x-fbm-signature': signature,
        },
        body: eventBody,
    });
    assert.equal(webhookResponse.status, 200);
    assert.ok(hasActiveCreatorSubscription(FAN_ID, CREATOR_ID));
});

test('streaming /streams/:id/access denies member_only without an active sub and allows with one', async () => {
    setup();
    const tier = await createTier(999);
    const streamId = 'test-stream-1';
    db.upsertStream({
        id: streamId,
        creatorId: CREATOR_ID,
        state: 'offline',
        title: 'Member only test',
        tags: [],
        visibility: 'member_only',
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
    });

    const fanWithStreamCap = {
        ...headersFor(FAN_ID, FAN_NAME),
        'x-blackout-capabilities': 'streaming.read',
    };

    // No subscription yet — denied.
    const denied = await app.request(
        `/v1/streaming/streams/${streamId}/access?subscriberId=${FAN_ID}`,
        { method: 'GET', headers: fanWithStreamCap }
    );
    assert.equal(denied.status, 200);
    const deniedBody = (await denied.json()) as { canAccess: boolean };
    assert.equal(deniedBody.canAccess, false);

    // Subscribe + capture.
    const sub = await app.request('/v1/creator-subs/subscribe', {
        method: 'POST',
        headers: headersFor(FAN_ID, FAN_NAME),
        body: JSON.stringify({ tierId: tier.id }),
    }).then((r) => r.json() as Promise<{ subscription: SubBody }>);
    await app.request(`/v1/creator-subs/subscriptions/${sub.subscription.id}/capture`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({}),
    });

    const allowed = await app.request(
        `/v1/streaming/streams/${streamId}/access?subscriberId=${FAN_ID}`,
        { method: 'GET', headers: fanWithStreamCap }
    );
    assert.equal(allowed.status, 200);
    const allowedBody = (await allowed.json()) as { canAccess: boolean };
    assert.equal(allowedBody.canAccess, true);
});
