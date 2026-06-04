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
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.BLACKOUT_GROWTH_ATTRIBUTION_WEBHOOKS = 'true';

const WEBHOOK_SECRET = process.env.FREEBLACKMARKET_WEBHOOK_SECRET;

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const { resetTipsForTest } = await import('../src/services/tips');
const { referralService, bountyRewardService, resetGrowthForTest } = await import(
    '../src/services/growth'
);
const { summarizeCreatorDrivenSalesFor } = await import('../src/services/creatorDrivenSales');
const { resetMarketplaceEntitlementsForTest } = await import(
    '../src/services/marketplaceEntitlements'
);
const { resetCountersForTest, getCounter } = await import(
    '../src/services/marketplaceObservability'
);

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

function signWebhook(rawBody: string): string {
    return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function eventBody(opts: {
    eventId: string;
    type: string;
    userId: string;
    metadata: Record<string, unknown>;
}): string {
    return JSON.stringify({
        eventId: opts.eventId,
        type: opts.type,
        userId: opts.userId,
        providerListingId: 'fbm-order-stub',
        sku: null,
        kind: 'subscription_tier',
        occurredAt: '2026-05-06T12:00:00.000Z',
        metadata: opts.metadata,
    });
}

async function postWebhook(eventId: string, body: string): Promise<Response> {
    return app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': eventId,
            'x-fbm-signature': signWebhook(body),
        },
        body,
    });
}

test('creator-driven sales aggregate counts settled referral + bounty rewards for a creator', async () => {
    resetTipsForTest();
    resetGrowthForTest();
    resetMarketplaceEntitlementsForTest();
    resetCountersForTest();

    // A creator who both refers a new user AND wins a bounty.
    ensureUser('creator-1', 'creator');
    ensureUser('referee-1', 'referee');
    ensureUser('poster-1', 'poster');

    const referral = referralService.create({
        referrerUserId: 'creator-1',
        refereeUserId: 'referee-1',
        sourceKind: 'coalition',
    });
    bountyRewardService.record({
        bountyId: 'bounty-1',
        beneficiaryId: 'creator-1',
        posterId: 'poster-1',
        rewardType: 'store_credit',
        rewardSummary: '$10 credit',
        rewardCents: 1_000,
    });

    // Settle the referral (gross 500) and the bounty reward (gross 1000).
    await postWebhook(
        'evt-ref-1',
        eventBody({
            eventId: 'evt-ref-1',
            type: 'referral.attributed',
            userId: 'referee-1',
            metadata: { referralId: referral.id, grossCents: 500, currency: 'USD' },
        }),
    );
    await postWebhook(
        'evt-bounty-1',
        eventBody({
            eventId: 'evt-bounty-1',
            type: 'bounty.reward_settled',
            userId: 'creator-1',
            metadata: { bountyId: 'bounty-1', grossCents: 1_000, currency: 'USD' },
        }),
    );

    const summary = summarizeCreatorDrivenSalesFor('creator-1');

    // Two creator-driven sales: GMV 1500, 3% fee = 45, net 1455.
    assert.equal(summary.total.count, 2);
    assert.equal(summary.total.gmvCents, 1_500);
    assert.equal(summary.total.feeCents, 45);
    assert.equal(summary.total.netCents, 1_455);

    assert.equal(summary.byKind.referral_bonus.count, 1);
    assert.equal(summary.byKind.referral_bonus.gmvCents, 500);
    assert.equal(summary.byKind.bounty_reward.count, 1);
    assert.equal(summary.byKind.bounty_reward.gmvCents, 1_000);
    assert.equal(summary.byKind.ambassador_commission.count, 0);
    assert.equal(summary.byKind.quest_reward.count, 0);

    // KPI counters incremented at settlement.
    assert.equal(getCounter('creator_driven_sales_total', { attributionKind: 'referral_bonus' }), 1);
    assert.equal(getCounter('creator_driven_sales_total', { attributionKind: 'bounty_reward' }), 1);
    assert.equal(getCounter('creator_driven_gmv_cents', { attributionKind: 'bounty_reward' }), 1_000);
});

test('a since filter scopes the summary to a window', async () => {
    resetTipsForTest();
    resetGrowthForTest();
    resetMarketplaceEntitlementsForTest();
    resetCountersForTest();

    ensureUser('creator-2', 'creator2');
    ensureUser('referee-2', 'referee2b');
    const referral = referralService.create({
        referrerUserId: 'creator-2',
        refereeUserId: 'referee-2',
    });
    await postWebhook(
        'evt-ref-2',
        eventBody({
            eventId: 'evt-ref-2',
            type: 'referral.attributed',
            userId: 'referee-2',
            metadata: { referralId: referral.id, grossCents: 500, currency: 'USD' },
        }),
    );

    // The settled tip's capture time is "now"; a far-future since excludes it.
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const scoped = summarizeCreatorDrivenSalesFor('creator-2', { sinceIso: future });
    assert.equal(scoped.total.count, 0);

    const all = summarizeCreatorDrivenSalesFor('creator-2');
    assert.equal(all.total.count, 1);
});

test('unauthenticated creator-driven-sales request is rejected', async () => {
    const res = await app.request('/v1/growth/creator-driven-sales', { method: 'GET' });
    assert.equal(res.status, 401);
});
