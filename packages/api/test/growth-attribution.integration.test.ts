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
process.env.BLACKOUT_ADMIN_API_KEY = process.env.BLACKOUT_ADMIN_API_KEY ?? 'test-admin-key';

const WEBHOOK_SECRET = process.env.FREEBLACKMARKET_WEBHOOK_SECRET;

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const { listTipsReceivedBy, resetTipsForTest } = await import('../src/services/tips');
const {
    referralService,
    ambassadorService,
    questsService,
    bountyRewardService,
    resetGrowthForTest,
} = await import('../src/services/growth');
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

interface AttributionEventOptions {
    eventId: string;
    type:
        | 'referral.attributed'
        | 'ambassador.commission_paid'
        | 'quest.reward_settled'
        | 'bounty.reward_settled';
    userId: string;
    metadata: Record<string, unknown>;
    occurredAt?: string;
}

function attributionEventBody(opts: AttributionEventOptions): string {
    return JSON.stringify({
        eventId: opts.eventId,
        type: opts.type,
        userId: opts.userId,
        providerListingId: 'fbm-order-stub',
        sku: null,
        kind: 'subscription_tier',
        occurredAt: opts.occurredAt ?? '2026-05-06T12:00:00.000Z',
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

function resetForEachTest(): void {
    resetTipsForTest();
    resetGrowthForTest();
    resetMarketplaceEntitlementsForTest();
    resetCountersForTest();
    process.env.BLACKOUT_GROWTH_ATTRIBUTION_WEBHOOKS = 'true';
}

test('referral.attributed creates a referral_bonus tip and settles the referral', async () => {
    resetForEachTest();
    ensureUser('referrer-1', 'referrer');
    ensureUser('referee-1', 'referee');

    const referral = referralService.create({
        referrerUserId: 'referrer-1',
        refereeUserId: 'referee-1',
        sourceKind: 'invite_link',
    });

    const eventId = 'evt-referral-1';
    const body = attributionEventBody({
        eventId,
        type: 'referral.attributed',
        userId: 'referee-1',
        metadata: {
            referralId: referral.id,
            grossCents: 500,
            currency: 'USD',
            fbmOrderId: 'fbm-order-ref-1',
        },
    });
    const response = await postWebhook(eventId, body);
    assert.equal(response.status, 200);

    const tips = listTipsReceivedBy('referrer-1');
    assert.equal(tips.length, 1);
    const [tip] = tips;
    assert.equal(tip!.contextKind, 'referral_bonus');
    assert.equal(tip!.status, 'captured');
    assert.equal(tip!.grossCents, 500);
    assert.equal(tip!.feeCents, 15); // 3% of 500
    assert.equal(tip!.netCents, 485);
    assert.equal(tip!.metadata?.['referralId'], referral.id);
    assert.equal(tip!.metadata?.['refereeUserId'], 'referee-1');

    const settled = referralService.get(referral.id);
    assert.equal(settled?.status, 'settled');
    assert.equal(settled?.rewardTipId, tip!.id);
    assert.equal(settled?.settledAt, '2026-05-06T12:00:00.000Z');
});

test('ambassador.commission_paid creates an ambassador_commission tip on the ambassador account', async () => {
    resetForEachTest();
    ensureUser('amb-user-1', 'ambassadortest');

    const ambassador = ambassadorService.apply({ userId: 'amb-user-1', tier: 'canopy' });

    const eventId = 'evt-amb-1';
    const body = attributionEventBody({
        eventId,
        type: 'ambassador.commission_paid',
        userId: 'amb-user-1',
        metadata: {
            ambassadorId: ambassador.id,
            periodKey: '2026-05',
            grossCents: 4_200,
            currency: 'USD',
            fbmOrderId: 'fbm-payout-amb-1',
        },
    });
    const response = await postWebhook(eventId, body);
    assert.equal(response.status, 200);

    const tips = listTipsReceivedBy('amb-user-1');
    assert.equal(tips.length, 1);
    const [tip] = tips;
    assert.equal(tip!.contextKind, 'ambassador_commission');
    assert.equal(tip!.status, 'captured');
    assert.equal(tip!.grossCents, 4_200);
    assert.equal(tip!.feeCents, 126); // 3% of 4200
    assert.equal(tip!.metadata?.['ambassadorId'], ambassador.id);
    assert.equal(tip!.metadata?.['periodKey'], '2026-05');
    assert.equal(tip!.metadata?.['tier'], 'canopy');
});

test('quest.reward_settled creates a quest_reward tip and links the completion', async () => {
    resetForEachTest();
    ensureUser('quester-1', 'quester');

    const quest = questsService.create({
        sourceKind: 'system',
        title: 'Welcome streak',
        description: 'Sign in 3 days in a row',
        rewardKind: 'tip',
        rewardCents: 200,
    });
    const completion = questsService.complete(quest.id, 'quester-1');

    const eventId = 'evt-quest-1';
    const body = attributionEventBody({
        eventId,
        type: 'quest.reward_settled',
        userId: 'quester-1',
        metadata: {
            questCompletionId: completion.id,
            questId: quest.id,
            grossCents: 200,
            currency: 'USD',
            fbmOrderId: 'fbm-quest-1',
        },
    });
    const response = await postWebhook(eventId, body);
    assert.equal(response.status, 200);

    const tips = listTipsReceivedBy('quester-1');
    assert.equal(tips.length, 1);
    const [tip] = tips;
    assert.equal(tip!.contextKind, 'quest_reward');
    assert.equal(tip!.status, 'captured');
    assert.equal(tip!.grossCents, 200);
    assert.equal(tip!.metadata?.['questCompletionId'], completion.id);
    assert.equal(tip!.metadata?.['questId'], quest.id);

    const settled = questsService
        .listCompletionsForUser('quester-1')
        .find((c) => c.id === completion.id);
    assert.equal(settled?.rewardTipId, tip!.id);
});

test('bounty.reward_settled creates a bounty_reward tip and settles the reward', async () => {
    resetForEachTest();
    ensureUser('bounty-poster-1', 'bountyposter');
    ensureUser('bounty-winner-1', 'bountywinner');

    const reward = bountyRewardService.record({
        bountyId: 'bounty-xyz',
        beneficiaryId: 'bounty-winner-1',
        posterId: 'bounty-poster-1',
        rewardType: 'store_credit',
        rewardSummary: '$5 store credit',
        rewardCents: 500,
    });
    assert.equal(reward.status, 'earned');

    const eventId = 'evt-bounty-1';
    const body = attributionEventBody({
        eventId,
        type: 'bounty.reward_settled',
        userId: 'bounty-winner-1',
        metadata: {
            bountyId: 'bounty-xyz',
            grossCents: 500,
            currency: 'USD',
            fbmOrderId: 'fbm-bounty-1',
        },
    });
    const response = await postWebhook(eventId, body);
    assert.equal(response.status, 200);

    const tips = listTipsReceivedBy('bounty-winner-1');
    assert.equal(tips.length, 1);
    const [tip] = tips;
    assert.equal(tip!.contextKind, 'bounty_reward');
    assert.equal(tip!.status, 'captured');
    assert.equal(tip!.grossCents, 500);
    assert.equal(tip!.metadata?.['bountyId'], 'bounty-xyz');
    assert.equal(tip!.metadata?.['posterId'], 'bounty-poster-1');

    const settled = bountyRewardService.get('bounty-xyz');
    assert.equal(settled?.status, 'settled');
    assert.equal(settled?.settledRef, tip!.id);
    assert.equal(settled?.settledAt, '2026-05-06T12:00:00.000Z');
});

test('flag off: dispatcher acks event but skips side-effects', async () => {
    resetForEachTest();
    process.env.BLACKOUT_GROWTH_ATTRIBUTION_WEBHOOKS = 'false';
    ensureUser('referrer-2', 'referrer2');
    ensureUser('referee-2', 'referee2');

    const referral = referralService.create({
        referrerUserId: 'referrer-2',
        refereeUserId: 'referee-2',
    });

    const eventId = 'evt-referral-flag-off';
    const body = attributionEventBody({
        eventId,
        type: 'referral.attributed',
        userId: 'referee-2',
        metadata: {
            referralId: referral.id,
            grossCents: 500,
            currency: 'USD',
        },
    });
    const response = await postWebhook(eventId, body);
    assert.equal(response.status, 200);

    assert.equal(listTipsReceivedBy('referrer-2').length, 0);
    const stillPending = referralService.get(referral.id);
    assert.equal(stillPending?.status, 'pending');
    assert.equal(stillPending?.rewardTipId, null);
    assert.ok(getCounter('marketplace_growth_attribution_skipped_total') >= 1);
});

test('webhook replay is idempotent: same eventId twice does not double-credit', async () => {
    resetForEachTest();
    ensureUser('referrer-3', 'referrer3');
    ensureUser('referee-3', 'referee3');

    const referral = referralService.create({
        referrerUserId: 'referrer-3',
        refereeUserId: 'referee-3',
    });
    const eventId = 'evt-referral-replay';
    const body = attributionEventBody({
        eventId,
        type: 'referral.attributed',
        userId: 'referee-3',
        metadata: { referralId: referral.id, grossCents: 500, currency: 'USD' },
    });

    const first = await postWebhook(eventId, body);
    assert.equal(first.status, 200);
    const second = await postWebhook(eventId, body);
    assert.equal(second.status, 200);

    const tips = listTipsReceivedBy('referrer-3');
    assert.equal(tips.length, 1);
});

test('unknown referralId: dispatcher acks but does not throw', async () => {
    resetForEachTest();

    const eventId = 'evt-referral-unknown';
    const body = attributionEventBody({
        eventId,
        type: 'referral.attributed',
        userId: 'whoever',
        metadata: {
            referralId: 'ref_does_not_exist',
            grossCents: 500,
            currency: 'USD',
        },
    });
    const response = await postWebhook(eventId, body);
    assert.equal(response.status, 200);
    assert.ok(getCounter('marketplace_growth_attribution_unresolved_total') >= 1);
});
