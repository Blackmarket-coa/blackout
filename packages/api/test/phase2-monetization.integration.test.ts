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
const { resetTipsForTest, captureTip } = await import('../src/services/tips');
const { resetMarketplaceEntitlementsForTest } = await import(
    '../src/services/marketplaceEntitlements'
);

const SENDER_ID = 'phase2-fan-1';
const SENDER_NAME = 'phase2-fan';
const CREATOR_ID = 'phase2-creator-1';
const CREATOR_NAME = 'phase2-creator';

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

function setup(): void {
    resetTipsForTest();
    resetMarketplaceEntitlementsForTest();
    ensureUser(SENDER_ID, SENDER_NAME);
    ensureUser(CREATOR_ID, CREATOR_NAME);
}

interface GiftDef {
    sku: string;
    label: string;
    priceCents: number;
    currency: string;
    sprite: string;
}
interface TipBody {
    id: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    giftSku: string | null;
    contextRef: string | null;
    status: string;
}

test('GET /v1/gifts/catalog returns the hardcoded sprite catalog', async () => {
    setup();
    const r = await app.request('/v1/gifts/catalog', {
        method: 'GET',
        headers: headersFor(SENDER_ID, SENDER_NAME),
    });
    assert.equal(r.status, 200);
    const { gifts } = (await r.json()) as { gifts: GiftDef[] };
    assert.ok(gifts.length >= 6, 'expected at least 6 gifts');
    const skus = new Set(gifts.map((g) => g.sku));
    assert.ok(skus.has('spark') && skus.has('rocket') && skus.has('galaxy'));
    for (const g of gifts) {
        assert.ok(g.priceCents >= 100, `gift ${g.sku} below tip floor`);
    }
});

test('POST /v1/gifts creates a tip carrying the gift sku and 3% split', async () => {
    setup();
    const r = await app.request('/v1/gifts', {
        method: 'POST',
        headers: headersFor(SENDER_ID, SENDER_NAME),
        body: JSON.stringify({
            recipientUserId: CREATOR_ID,
            sku: 'rocket',
            contextKind: 'stream',
            contextRef: 'stream-phase2-1',
        }),
    });
    assert.equal(r.status, 201);
    const { tip, gift } = (await r.json()) as { tip: TipBody; gift: GiftDef };
    assert.equal(gift.sku, 'rocket');
    assert.equal(tip.giftSku, 'rocket');
    assert.equal(tip.grossCents, 500);
    assert.equal(tip.feeCents, 15);
    assert.equal(tip.netCents, 485);
});

test('POST /v1/gifts rejects unknown skus with 400 (zod validation)', async () => {
    setup();
    const r = await app.request('/v1/gifts', {
        method: 'POST',
        headers: headersFor(SENDER_ID, SENDER_NAME),
        body: JSON.stringify({
            recipientUserId: CREATOR_ID,
            sku: 'doesnt-exist',
            contextKind: 'stream',
            contextRef: 'stream-x',
        }),
    });
    assert.equal(r.status, 400);
});

test('POST /v1/gifts blocks self-gifting', async () => {
    setup();
    const r = await app.request('/v1/gifts', {
        method: 'POST',
        headers: headersFor(CREATOR_ID, CREATOR_NAME),
        body: JSON.stringify({
            recipientUserId: CREATOR_ID,
            sku: 'spark',
            contextKind: 'profile',
        }),
    });
    assert.equal(r.status, 400);
    const body = (await r.json()) as { code: string };
    assert.equal(body.code, 'self_gift_forbidden');
});

test('GET /v1/streaming/streams/:id/revenue aggregates captured tips and gifts', async () => {
    setup();
    const streamId = 'stream-rev-1';
    db.upsertStream({
        id: streamId,
        creatorId: CREATOR_ID,
        state: 'live',
        title: 'rev test',
        tags: [],
        visibility: 'public',
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
    });

    // 3 captured tips: 1000, 500 (gift=rocket), 250 (gift=flame).
    const tipResp = await app.request('/v1/tips', {
        method: 'POST',
        headers: headersFor(SENDER_ID, SENDER_NAME),
        body: JSON.stringify({
            recipientUserId: CREATOR_ID,
            contextKind: 'stream',
            contextRef: streamId,
            grossCents: 1000,
            currency: 'USD',
        }),
    });
    const { tip: t1 } = (await tipResp.json()) as { tip: TipBody };
    captureTip(t1.id, { fbmOrderId: 'o1' });

    for (const sku of ['rocket', 'flame']) {
        const r = await app.request('/v1/gifts', {
            method: 'POST',
            headers: headersFor(SENDER_ID, SENDER_NAME),
            body: JSON.stringify({
                recipientUserId: CREATOR_ID,
                sku,
                contextKind: 'stream',
                contextRef: streamId,
            }),
        });
        const { tip } = (await r.json()) as { tip: TipBody };
        captureTip(tip.id, { fbmOrderId: `o-${sku}` });
    }

    const headers = {
        ...headersFor(CREATOR_ID, CREATOR_NAME),
        'x-blackout-capabilities': 'streaming.read',
    };
    const rev = await app.request(`/v1/streaming/streams/${streamId}/revenue`, {
        method: 'GET',
        headers,
    });
    assert.equal(rev.status, 200);
    const breakdown = (await rev.json()) as {
        grossCents: number;
        feeCents: number;
        netCents: number;
        tipCount: number;
        giftCount: number;
        uniqueSenderCount: number;
        creatorUserId: string;
    };
    assert.equal(breakdown.grossCents, 1750);
    assert.equal(breakdown.feeCents, 30 + 15 + 8); // 1000@3%=30 + 500@3%=15 + 250@3%=8 (rounded)
    assert.equal(breakdown.netCents, breakdown.grossCents - breakdown.feeCents);
    assert.equal(breakdown.tipCount, 3);
    assert.equal(breakdown.giftCount, 2);
    assert.equal(breakdown.uniqueSenderCount, 1);
    assert.equal(breakdown.creatorUserId, CREATOR_ID);
});

test('GET /v1/streaming/streams/:id/goal computes percent against the captured-revenue total', async () => {
    setup();
    const streamId = 'stream-goal-1';
    db.upsertStream({
        id: streamId,
        creatorId: CREATOR_ID,
        state: 'live',
        title: 'goal test',
        tags: [],
        visibility: 'public',
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
    });
    const tipR = await app.request('/v1/tips', {
        method: 'POST',
        headers: headersFor(SENDER_ID, SENDER_NAME),
        body: JSON.stringify({
            recipientUserId: CREATOR_ID,
            contextKind: 'stream',
            contextRef: streamId,
            grossCents: 2500,
            currency: 'USD',
        }),
    });
    const { tip } = (await tipR.json()) as { tip: TipBody };
    captureTip(tip.id, { fbmOrderId: 'goal-1' });

    const headers = {
        ...headersFor(CREATOR_ID, CREATOR_NAME),
        'x-blackout-capabilities': 'streaming.read',
    };
    const r = await app.request(
        `/v1/streaming/streams/${streamId}/goal?targetCents=10000&currency=USD`,
        { method: 'GET', headers }
    );
    assert.equal(r.status, 200);
    const progress = (await r.json()) as {
        achievedCents: number;
        percent: number;
        metAt: string | null;
    };
    assert.equal(progress.achievedCents, 2500);
    assert.equal(progress.percent, 25);
    assert.equal(progress.metAt, null);
});

test('GET /v1/streaming/streams/:id/goal flags metAt when target is reached', async () => {
    setup();
    const streamId = 'stream-goal-2';
    db.upsertStream({
        id: streamId,
        creatorId: CREATOR_ID,
        state: 'live',
        title: 'goal met',
        tags: [],
        visibility: 'public',
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
    });
    const tipR = await app.request('/v1/tips', {
        method: 'POST',
        headers: headersFor(SENDER_ID, SENDER_NAME),
        body: JSON.stringify({
            recipientUserId: CREATOR_ID,
            contextKind: 'stream',
            contextRef: streamId,
            grossCents: 5000,
            currency: 'USD',
        }),
    });
    const { tip } = (await tipR.json()) as { tip: TipBody };
    captureTip(tip.id, { fbmOrderId: 'goal-met-1' });

    const headers = {
        ...headersFor(CREATOR_ID, CREATOR_NAME),
        'x-blackout-capabilities': 'streaming.read',
    };
    const r = await app.request(
        `/v1/streaming/streams/${streamId}/goal?targetCents=2500&currency=USD`,
        { method: 'GET', headers }
    );
    const progress = (await r.json()) as { percent: number; metAt: string | null };
    assert.equal(progress.percent, 100);
    assert.ok(progress.metAt, 'metAt should be set when achieved >= target');
});

test('GET /v1/entitlements/listings/:providerId/:providerListingId returns canAccess=false when no entitlement exists', async () => {
    setup();
    const r = await app.request(
        '/v1/entitlements/listings/freeblackmarket/post-unlock-listing-1',
        { method: 'GET', headers: headersFor(SENDER_ID, SENDER_NAME) }
    );
    assert.equal(r.status, 200);
    const gate = (await r.json()) as { canAccess: boolean; entitlementId: string | null };
    assert.equal(gate.canAccess, false);
    assert.equal(gate.entitlementId, null);
});

test('GET /v1/entitlements/listings/... returns canAccess=true after a post_unlock purchase', async () => {
    setup();
    const listingId = 'post-unlock-listing-2';
    const eventBody = JSON.stringify({
        eventId: 'evt-paywall-1',
        type: 'purchase.succeeded',
        userId: SENDER_ID,
        providerListingId: listingId,
        sku: null,
        kind: 'post_unlock',
        occurredAt: new Date().toISOString(),
        metadata: {},
    });
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(eventBody).digest('hex');
    const wh = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-paywall-1',
            'x-fbm-signature': signature,
        },
        body: eventBody,
    });
    assert.equal(wh.status, 200);

    const gate = await app.request(
        `/v1/entitlements/listings/freeblackmarket/${listingId}`,
        { method: 'GET', headers: headersFor(SENDER_ID, SENDER_NAME) }
    );
    assert.equal(gate.status, 200);
    const body = (await gate.json()) as { canAccess: boolean; kind: string | null };
    assert.equal(body.canAccess, true);
    assert.equal(body.kind, 'post_unlock');
});

test('GET /v1/entitlements/listings/... canAccess flips to false after refund', async () => {
    setup();
    const listingId = 'event-ticket-listing-1';
    const grant = JSON.stringify({
        eventId: 'evt-ticket-grant',
        type: 'purchase.succeeded',
        userId: SENDER_ID,
        providerListingId: listingId,
        sku: 'tier-front-row',
        kind: 'event_ticket',
        occurredAt: new Date().toISOString(),
        metadata: {},
    });
    const refund = JSON.stringify({
        eventId: 'evt-ticket-refund',
        type: 'purchase.refunded',
        userId: SENDER_ID,
        providerListingId: listingId,
        sku: 'tier-front-row',
        kind: 'event_ticket',
        occurredAt: new Date().toISOString(),
        metadata: {},
    });
    const sig = (body: string): string =>
        crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-ticket-grant',
            'x-fbm-signature': sig(grant),
        },
        body: grant,
    });
    await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-ticket-refund',
            'x-fbm-signature': sig(refund),
        },
        body: refund,
    });

    const r = await app.request(
        `/v1/entitlements/listings/freeblackmarket/${listingId}?sku=tier-front-row`,
        { method: 'GET', headers: headersFor(SENDER_ID, SENDER_NAME) }
    );
    const gate = (await r.json()) as { canAccess: boolean; status: string | null };
    assert.equal(gate.canAccess, false);
    assert.equal(gate.status, 'refunded');
});

test('GET /v1/entitlements/listings/... rejects unknown providers with 400', async () => {
    setup();
    const r = await app.request('/v1/entitlements/listings/bogus-provider/listing-x', {
        method: 'GET',
        headers: headersFor(SENDER_ID, SENDER_NAME),
    });
    assert.equal(r.status, 400);
});

void ADMIN_KEY;
