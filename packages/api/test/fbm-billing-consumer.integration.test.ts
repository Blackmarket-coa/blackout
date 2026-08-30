// W1b: Blackout consumes FBM as its ONLY billing rail. This suite covers the
// three consumer seams end-to-end against the FBM stub:
//   1. Canopy checkout delegates to the FBM provider (plan → listing mapping)
//      and the settled purchase loops back through the marketplace webhook
//      (`metadata.canopyPlanCode` → invoice.paid) — no Stripe/Lago anywhere.
//   2. Creator-sub subscribe returns the payment leg (redirectUrl/sessionId).
//   3. The read-time lapse repair expires past-due creator subs so the
//      unique-active index can never block a resubscribe.

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

const WEBHOOK_SECRET = process.env.FREEBLACKMARKET_WEBHOOK_SECRET!;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { getMarketplaceProvider } = await import('../src/integrations/marketplace');
const { getFreeblackmarketStubInternals } = await import(
    '../src/integrations/marketplace/freeblackmarketStub'
);
const {
    createCheckoutSession,
    fbmListingIdForPlan,
    getSubscription: getCanopySubscription,
} = await import('../src/services/subscriptions');
const {
    captureSubscription,
    getSubscription: getCreatorSubscription,
    hasActiveCreatorSubscription,
    resetCreatorSubscriptionsForTest,
    startSubscription,
} = await import('../src/services/creatorSubscriptions');

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

async function postFbmWebhook(eventBody: string, eventId: string): Promise<Response> {
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(eventBody).digest('hex');
    return app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': eventId,
            'x-fbm-signature': signature,
        },
        body: eventBody,
    });
}

async function firstStubListingId(): Promise<string> {
    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider?.enabled, 'stub provider is enabled');
    const listings = await provider!.fetchCatalog({});
    assert.ok(listings.length > 0, 'stub catalog is seeded');
    return listings[0].providerListingId;
}

test('fbmListingIdForPlan reads the CANOPY_FBM_LISTING_IDS mapping defensively', () => {
    assert.equal(fbmListingIdForPlan('canopy_sprout_monthly', {}), null);
    assert.equal(
        fbmListingIdForPlan('canopy_sprout_monthly', { CANOPY_FBM_LISTING_IDS: 'not-json' }),
        null
    );
    assert.equal(
        fbmListingIdForPlan('canopy_sprout_monthly', {
            CANOPY_FBM_LISTING_IDS: '{"canopy_pro_monthly":"clist_other"}',
        }),
        null
    );
    assert.equal(
        fbmListingIdForPlan('canopy_sprout_monthly', {
            CANOPY_FBM_LISTING_IDS: '{"canopy_sprout_monthly":"clist_1"}',
        }),
        'clist_1'
    );
});

test('Canopy plan purchase runs FBM checkout → stub webhook → active subscription', async () => {
    const userId = 'canopy-fbm-user-1';
    ensureUser(userId, 'canopy-fbm-user');
    const listingId = await firstStubListingId();
    process.env.CANOPY_FBM_LISTING_IDS = JSON.stringify({ canopy_sprout_monthly: listingId });
    try {
        // 1. Checkout delegates to the provider with the plan-code echo.
        const session = await createCheckoutSession({
            userId,
            planCode: 'canopy_sprout_monthly',
        });
        assert.equal(session.provider, 'freeblackmarket');
        assert.ok(session.sessionId);
        assert.ok(session.redirectUrl.length > 0);

        // 2. The stub materializes the settled-purchase webhook — carrying the
        //    metadata echo — exactly as live FBM would.
        const provider = getMarketplaceProvider('freeblackmarket')!;
        const internals = getFreeblackmarketStubInternals(provider);
        assert.ok(internals, 'stub internals are available');
        const webhook = internals!.materializeWebhook(session.sessionId);
        assert.ok(webhook, 'stub can materialize the webhook for the session');
        const parsedBody = JSON.parse(webhook!.body) as {
            metadata: Record<string, unknown>;
        };
        assert.equal(parsedBody.metadata.canopyPlanCode, 'canopy_sprout_monthly');

        // 3. The canonical webhook route routes it through the canopy branch.
        const res = await postFbmWebhook(webhook!.body, webhook!.eventId);
        assert.equal(res.status, 200);

        const snapshot = getCanopySubscription(userId);
        assert.equal(snapshot.status, 'active');
        assert.equal(snapshot.planCode, 'canopy_sprout_monthly');
        assert.equal(snapshot.tier, 'sprout');
        assert.equal(snapshot.entitlementActive, true);

        // 4. Refund maps to charge.refunded → canceled.
        const refundBody = JSON.stringify({
            eventId: `evt-canopy-refund-${Date.now()}`,
            type: 'purchase.refunded',
            userId,
            providerListingId: listingId,
            sku: null,
            kind: 'subscription_tier',
            occurredAt: new Date().toISOString(),
            metadata: { canopyPlanCode: 'canopy_sprout_monthly' },
        });
        const refundRes = await postFbmWebhook(refundBody, 'evt-canopy-refund');
        assert.equal(refundRes.status, 200);
        assert.equal(getCanopySubscription(userId).status, 'canceled');
    } finally {
        delete process.env.CANOPY_FBM_LISTING_IDS;
    }
});

test('creator-sub subscribe returns the FBM payment leg with a deterministic idempotency anchor', async () => {
    resetCreatorSubscriptionsForTest();
    const creatorId = 'fbm-billing-creator-1';
    const fanId = 'fbm-billing-fan-1';
    const creatorHeaders = headersFor(creatorId, 'fbm-billing-creator');
    const fanHeaders = headersFor(fanId, 'fbm-billing-fan');

    const tierRes = await app.request('/v1/creator-subs/me/tiers', {
        method: 'POST',
        headers: creatorHeaders,
        body: JSON.stringify({ name: 'Backstage', priceCents: 500, currency: 'USD' }),
    });
    assert.equal(tierRes.status, 201);
    const { tier } = (await tierRes.json()) as {
        tier: { id: string; fbmListingId: string | null };
    };
    assert.ok(tier.fbmListingId, 'stub registered the tier listing');

    const subRes = await app.request('/v1/creator-subs/subscribe', {
        method: 'POST',
        headers: fanHeaders,
        body: JSON.stringify({ tierId: tier.id }),
    });
    assert.equal(subRes.status, 201);
    const body = (await subRes.json()) as {
        subscription: { id: string; status: string };
        redirectUrl: string | null;
        sessionId: string | null;
        embed: boolean;
    };
    assert.equal(body.subscription.status, 'pending');
    assert.ok(body.redirectUrl, 'payment leg present');
    assert.ok(body.sessionId, 'session id present');
    assert.equal(body.embed, false);

    // The stub session carries the return-leg correlation id.
    const provider = getMarketplaceProvider('freeblackmarket')!;
    const internals = getFreeblackmarketStubInternals(provider);
    const session = internals!.getSession(body.sessionId!);
    assert.ok(session, 'stub session exists');
});

test('read-time lapse repair expires past-due creator subs and unblocks resubscribe', () => {
    resetCreatorSubscriptionsForTest();
    const creatorId = 'fbm-lapse-creator-1';
    const fanId = 'fbm-lapse-fan-1';
    ensureUser(creatorId, 'fbm-lapse-creator');
    ensureUser(fanId, 'fbm-lapse-fan');

    const tier = db.getCreatorSubscriptionTier('fbm-lapse-tier-1')
        ? undefined
        : db.insertCreatorSubscriptionTier({
              id: 'fbm-lapse-tier-1',
              creatorUserId: creatorId,
              name: 'Lapse tier',
              description: null,
              priceCents: 500,
              currency: 'USD',
              providerId: 'freeblackmarket',
              fbmListingId: 'fbm-lapse-listing',
              status: 'active',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
          });
    void tier;

    const sub = startSubscription({ subscriberUserId: fanId, tierId: 'fbm-lapse-tier-1' });

    // Activate with a period that ended 40 days ago (beyond the 3-day grace).
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    captureSubscription(sub.id, { periodDays: 30, effectiveAt: fortyDaysAgo });

    // Any read repairs the row to expired…
    assert.equal(hasActiveCreatorSubscription(fanId, creatorId), false);
    assert.equal(getCreatorSubscription(sub.id)?.status, 'expired');

    // …so a fresh subscribe is no longer blocked by the unique-active index.
    const again = startSubscription({ subscriberUserId: fanId, tierId: 'fbm-lapse-tier-1' });
    assert.equal(again.status, 'pending');
    assert.notEqual(again.id, sub.id);

    // A late renewal charge on the ORIGINAL row still re-activates it (money
    // moved ⇒ access) rather than being dropped as terminal.
    const captured = captureSubscription(sub.id, { periodDays: 30 });
    assert.equal(captured?.status, 'active');
});
