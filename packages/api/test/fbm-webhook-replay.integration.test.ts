/**
 * FBM webhook replay (D5 in docs/black-mask-account-link-design.md §7;
 * docs/security/api-findings-triage-2026-10-25.md). Two defences:
 *
 *  1. A delivery whose event id was already processed is acknowledged before
 *     any handler runs. Until 2026-10-25 the tip, creator-subscription,
 *     canopy-plan and boost captures re-ran on every replay — a replay
 *     re-activated a cancelled subscription.
 *  2. A delivery may carry `x-fbm-timestamp`; the signature then covers
 *     `<timestamp>.<body>` and the timestamp must be within the tolerance, so
 *     a captured delivery stops verifying when the window closes. The body-only
 *     form stays accepted until FREEBLACKMARKET_WEBHOOK_REQUIRE_TIMESTAMP=1.
 *
 * The stub provider shares the real provider's verifier, so the route-level
 * tests here exercise the production acceptance rules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.FREEBLACKMARKET_BASE_URL = 'https://api.freeblackmarket.test';
process.env.FREEBLACKMARKET_API_KEY = 'test-api-key';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.FREEBLACKMARKET_STUB = '1';
delete process.env.FREEBLACKMARKET_WEBHOOK_REQUIRE_TIMESTAMP;
delete process.env.FREEBLACKMARKET_WEBHOOK_TOLERANCE_SECONDS;

const SECRET = 'test-webhook-secret';

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const { verifyFreeblackmarketWebhookSignature, WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS } = await import(
    '../src/integrations/marketplace/freeblackmarket'
);
const { getCounter, resetCountersForTest } = await import(
    '../src/services/marketplaceObservability'
);
const { createTip, getTip, resetTipsForTest } = await import('../src/services/tips');
const {
    cancelSubscription,
    createTier,
    getSubscription,
    resetCreatorSubscriptionsForTest,
    startSubscription,
} = await import('../src/services/creatorSubscriptions');
const { resetMarketplaceEntitlementsForTest } = await import(
    '../src/services/marketplaceEntitlements'
);

const signBody = (body: string, secret = SECRET) =>
    crypto.createHmac('sha256', secret).update(body).digest('hex');
const signTimestamped = (timestamp: number | string, body: string, secret = SECRET) =>
    crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
const nowSeconds = () => Math.floor(Date.now() / 1000);

const ensureUser = (id: string, username: string) => {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
};

const deliver = (body: string, headers: Record<string, string>) =>
    app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body,
    });

type WebhookJson = { ok: boolean; alreadyProcessed?: boolean; reason?: string };

const purchase = (overrides: Record<string, unknown>) =>
    JSON.stringify({
        type: 'purchase.succeeded',
        userId: 'fan-replay',
        providerListingId: 'listing-replay',
        sku: null,
        kind: 'asset_bundle',
        occurredAt: new Date().toISOString(),
        metadata: {},
        ...overrides,
    });

const reset = () => {
    resetCountersForTest();
    resetTipsForTest();
    resetCreatorSubscriptionsForTest();
    resetMarketplaceEntitlementsForTest();
    ensureUser('fan-replay', 'fan-replay');
    ensureUser('creator-replay', 'creator-replay');
};

// ---------------------------------------------------------------- verifier

test('verifier: the body-only form is accepted until a timestamp is required', () => {
    const rawBody = '{"eventId":"e1"}';
    const headers = { 'x-fbm-signature': signBody(rawBody), 'x-fbm-event-id': 'e1' };
    assert.deepEqual(
        verifyFreeblackmarketWebhookSignature({
            rawBody,
            headers,
            secret: SECRET,
            requireTimestamp: false,
        }),
        { ok: true, eventId: 'e1', reason: undefined }
    );
    assert.deepEqual(
        verifyFreeblackmarketWebhookSignature({
            rawBody,
            headers,
            secret: SECRET,
            requireTimestamp: true,
        }),
        { ok: false, eventId: 'e1', reason: 'timestamp-missing' }
    );
});

test('verifier: the timestamped form binds the timestamp and enforces the window', () => {
    const rawBody = '{"eventId":"e2"}';
    const now = 1_800_000_000;
    const at = (timestamp: number | string, signature: string, requireTimestamp = true) =>
        verifyFreeblackmarketWebhookSignature({
            rawBody,
            headers: { 'x-fbm-signature': signature, 'x-fbm-timestamp': String(timestamp) },
            secret: SECRET,
            requireTimestamp,
            nowSeconds: now,
        });

    assert.equal(at(now, signTimestamped(now, rawBody)).ok, true);
    assert.equal(at(now, signTimestamped(now, rawBody), false).ok, true, 'also when not required');
    assert.equal(
        at(
            now - WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
            signTimestamped(now - WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS, rawBody)
        ).ok,
        true,
        'edge of the window'
    );

    const stale = now - WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS - 1;
    assert.equal(at(stale, signTimestamped(stale, rawBody)).reason, 'timestamp-skew');
    const future = now + WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS + 1;
    assert.equal(at(future, signTimestamped(future, rawBody)).reason, 'timestamp-skew');

    // The header is part of the signed material: a body-only signature with a
    // timestamp attached, or a signature made for another timestamp, fails.
    assert.equal(at(now, signBody(rawBody)).reason, 'signature-mismatch');
    assert.equal(at(now, signTimestamped(now - 1, rawBody)).reason, 'signature-mismatch');
    assert.equal(
        at('yesterday', signTimestamped('yesterday', rawBody)).reason,
        'timestamp-invalid'
    );

    // A custom tolerance is honoured.
    const result = verifyFreeblackmarketWebhookSignature({
        rawBody,
        headers: {
            'x-fbm-signature': signTimestamped(now - 20, rawBody),
            'x-fbm-timestamp': String(now - 20),
        },
        secret: SECRET,
        requireTimestamp: true,
        toleranceSeconds: 10,
        nowSeconds: now,
    });
    assert.equal(result.reason, 'timestamp-skew');
});

test('verifier: a missing secret or signature is refused before any comparison', () => {
    const rawBody = '{}';
    assert.equal(
        verifyFreeblackmarketWebhookSignature({
            rawBody,
            headers: { 'x-fbm-signature': 'ab' },
            secret: '',
            requireTimestamp: false,
        }).reason,
        'webhook-secret-missing'
    );
    assert.equal(
        verifyFreeblackmarketWebhookSignature({
            rawBody,
            headers: {},
            secret: SECRET,
            requireTimestamp: false,
        }).reason,
        'signature-missing'
    );
    assert.equal(
        verifyFreeblackmarketWebhookSignature({
            rawBody,
            headers: { 'x-fbm-signature': signBody(rawBody, 'other') },
            secret: SECRET,
            requireTimestamp: false,
        }).reason,
        'signature-mismatch'
    );
});

// ------------------------------------------------------------------- route

test('route: a timestamped delivery is accepted and a stale one refused 401 timestamp-skew', async () => {
    reset();
    const body = purchase({ eventId: 'evt-ts-fresh' });
    const fresh = nowSeconds();
    const accepted = await deliver(body, {
        'x-fbm-event-id': 'evt-ts-fresh',
        'x-fbm-timestamp': String(fresh),
        'x-fbm-signature': signTimestamped(fresh, body),
    });
    assert.equal(accepted.status, 200);
    assert.equal(((await accepted.json()) as WebhookJson).alreadyProcessed, false);

    const staleBody = purchase({ eventId: 'evt-ts-stale' });
    const stale = nowSeconds() - WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS - 60;
    const refused = await deliver(staleBody, {
        'x-fbm-event-id': 'evt-ts-stale',
        'x-fbm-timestamp': String(stale),
        'x-fbm-signature': signTimestamped(stale, staleBody),
    });
    assert.equal(refused.status, 401);
    assert.equal(((await refused.json()) as WebhookJson).reason, 'timestamp-skew');

    // A body-only signature with a timestamp attached is not the timestamped form.
    const mixed = await deliver(staleBody, {
        'x-fbm-event-id': 'evt-ts-stale',
        'x-fbm-timestamp': String(nowSeconds()),
        'x-fbm-signature': signBody(staleBody),
    });
    assert.equal(mixed.status, 401);
    assert.equal(((await mixed.json()) as WebhookJson).reason, 'signature-mismatch');
});

test('route: a replayed tip capture is acknowledged without capturing again', async () => {
    reset();
    const tip = createTip({
        senderUserId: 'fan-replay',
        recipientUserId: 'creator-replay',
        contextKind: 'profile',
        grossCents: 500,
        currency: 'USD',
    });
    const body = purchase({
        eventId: 'evt-tip-replay',
        amountCents: 500,
        metadata: { tipId: tip.id, fbmOrderId: 'order-tip-1' },
    });
    const headers = { 'x-fbm-event-id': 'evt-tip-replay', 'x-fbm-signature': signBody(body) };

    const first = await deliver(body, headers);
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as WebhookJson).alreadyProcessed, false);
    assert.equal(getTip(tip.id)?.status, 'captured');
    assert.equal(
        getCounter('marketplace_tip_captured_total', { providerId: 'freeblackmarket' }),
        1
    );

    const second = await deliver(body, headers);
    assert.equal(second.status, 200);
    assert.equal(((await second.json()) as WebhookJson).alreadyProcessed, true);
    assert.equal(
        getCounter('marketplace_tip_captured_total', { providerId: 'freeblackmarket' }),
        1,
        'captured once'
    );
    assert.equal(
        getCounter('marketplace_webhook_replayed_total', { providerId: 'freeblackmarket' }),
        1
    );
    assert.equal(getTip(tip.id)?.status, 'captured');
});

test('route: a replay does not re-activate a subscription cancelled after the first delivery', async () => {
    reset();
    const tier = await createTier({
        creatorUserId: 'creator-replay',
        name: 'Supporter',
        priceCents: 999,
        currency: 'USD',
    });
    const sub = startSubscription({ subscriberUserId: 'fan-replay', tierId: tier.id });
    const body = purchase({
        eventId: 'evt-sub-replay',
        kind: 'subscription_tier',
        providerListingId: tier.fbmListingId ?? 'fbm-tier-listing',
        metadata: { creatorSubscriptionId: sub.id, fbmSubscriptionId: 'fbm-sub-replay' },
    });
    const headers = { 'x-fbm-event-id': 'evt-sub-replay', 'x-fbm-signature': signBody(body) };

    const first = await deliver(body, headers);
    assert.equal(first.status, 200);
    assert.equal(getSubscription(sub.id)?.status, 'active');

    const cancelled = cancelSubscription(sub.id, 'fan-replay');
    assert.equal(cancelled?.status, 'canceled');
    assert.ok(cancelled?.canceledAt);

    const replay = await deliver(body, headers);
    assert.equal(replay.status, 200);
    assert.equal(((await replay.json()) as WebhookJson).alreadyProcessed, true);
    const after = getSubscription(sub.id);
    assert.equal(after?.status, 'canceled', 'the replay did not re-run the capture');
    assert.equal(after?.canceledAt, cancelled?.canceledAt);
    assert.equal(
        getCounter('marketplace_creator_sub_captured_total', { providerId: 'freeblackmarket' }),
        1
    );
});

test('route: a replay under a fresh x-fbm-event-id header is caught by the signed payload id', async () => {
    // The header is not covered by the signature; the body, and the eventId in
    // it, are. A captured delivery re-sent with a new header value must still
    // be recognised as the delivery it is.
    reset();
    const tip = createTip({
        senderUserId: 'fan-replay',
        recipientUserId: 'creator-replay',
        contextKind: 'profile',
        grossCents: 700,
        currency: 'USD',
    });
    const body = purchase({
        eventId: 'evt-tip-header-swap',
        amountCents: 700,
        metadata: { tipId: tip.id, fbmOrderId: 'order-tip-header-swap' },
    });
    const signature = signBody(body);

    const first = await deliver(body, {
        'x-fbm-event-id': 'evt-tip-header-swap',
        'x-fbm-signature': signature,
    });
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as WebhookJson).alreadyProcessed, false);

    const replay = await deliver(body, {
        'x-fbm-event-id': 'evt-attacker-chosen',
        'x-fbm-signature': signature,
    });
    assert.equal(replay.status, 200);
    assert.equal(((await replay.json()) as WebhookJson).alreadyProcessed, true);
    assert.equal(
        getCounter('marketplace_tip_captured_total', { providerId: 'freeblackmarket' }),
        1,
        'the capture ran once, not again under the new header'
    );
});

test('route: a replay is recognised by the payload event id when the header is absent', async () => {
    reset();
    const body = purchase({ eventId: 'evt-no-header', providerListingId: 'listing-no-header' });
    const headers = { 'x-fbm-signature': signBody(body) };
    const first = await deliver(body, headers);
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as WebhookJson).alreadyProcessed, false);
    const second = await deliver(body, headers);
    assert.equal(second.status, 200);
    assert.equal(((await second.json()) as WebhookJson).alreadyProcessed, true);
});
