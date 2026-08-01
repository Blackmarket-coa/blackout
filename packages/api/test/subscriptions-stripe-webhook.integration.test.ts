// A3: the Stripe checkout webhook that syncs the real `cus_…` onto the
// subscription record. Without this, the Billing Portal can never leave its mock
// path (createCustomerPortalSession only goes live for a real cus_ that is not
// the mock `cus_<userId>`). See docs/operations/MONETIZATION_GO_LIVE.md §3.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
// Subscription/webhook state is now DURABLE (services/subscriptions.ts writes to
// db.*), so a file-mode store persists processed event ids (evt_a3_*) across runs
// and re-reads them as already-processed. Pin a fresh in-memory store — matching
// every other db-touching integration suite — so this webhook ledger starts empty
// and stays deterministic regardless of test file load order.
process.env.BLACKOUT_DB_MODE = 'memory';

const { default: app } = await import('../src/index');
const { getSubscription } = await import('../src/services/subscriptions');

const SECRET = 'whsec_test_secret';

function stripeSignature(rawBody: string, secret = SECRET): string {
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
    return `t=${t},v1=${v1}`;
}

function postWebhook(rawBody: string, signature: string) {
    return app.request('/v1/subscriptions/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': signature },
        body: rawBody,
    });
}

test('checkout.session.completed syncs the real cus_ onto the subscription record', async () => {
    const userId = 'user-a3-1';
    const raw = JSON.stringify({
        id: 'evt_a3_1',
        type: 'checkout.session.completed',
        data: { object: { client_reference_id: userId, customer: 'cus_realABC123' } },
    });
    const res = await postWebhook(raw, stripeSignature(raw));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { processed: boolean; userId?: string };
    assert.equal(body.processed, true);
    assert.equal(body.userId, userId);

    // The record now carries the real cus_, not the mock cus_<userId>.
    assert.equal(getSubscription(userId).stripeCustomerId, 'cus_realABC123');
});

test('the same event is idempotent (deduped by Stripe event id)', async () => {
    const userId = 'user-a3-2';
    const raw = JSON.stringify({
        id: 'evt_a3_2',
        type: 'checkout.session.completed',
        data: { object: { client_reference_id: userId, customer: 'cus_first' } },
    });
    const first = await postWebhook(raw, stripeSignature(raw));
    assert.equal(((await first.json()) as { processed: boolean }).processed, true);

    const second = await postWebhook(raw, stripeSignature(raw));
    const body = (await second.json()) as { processed: boolean; reason?: string };
    assert.equal(body.processed, false);
    assert.equal(body.reason, 'already_processed');
});

test('a bad signature is rejected with 401', async () => {
    const raw = JSON.stringify({
        id: 'evt_a3_bad',
        type: 'checkout.session.completed',
        data: { object: { client_reference_id: 'user-a3-3', customer: 'cus_x' } },
    });
    const res = await postWebhook(raw, 't=9999999999,v1=deadbeef');
    assert.equal(res.status, 401);
    assert.equal(getSubscription('user-a3-3').stripeCustomerId, 'cus_user-a3-3'); // still mock
});

test('non-checkout event types are acknowledged but not processed', async () => {
    const raw = JSON.stringify({
        id: 'evt_a3_other',
        type: 'customer.subscription.updated',
        data: { object: { client_reference_id: 'user-a3-4', customer: 'cus_y' } },
    });
    const res = await postWebhook(raw, stripeSignature(raw));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { processed: boolean; reason?: string };
    assert.equal(body.processed, false);
    assert.equal(body.reason, 'ignored_event_type');
});
