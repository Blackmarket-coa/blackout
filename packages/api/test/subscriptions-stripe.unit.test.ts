import test from 'node:test';
import assert from 'node:assert/strict';

// Isolate env so live-mode toggling doesn't leak across tests.
const ORIGINAL_ENV = { ...process.env };

const { createCheckoutSession, createCustomerPortalSession } = await import(
    '../src/services/subscriptions'
);

interface Captured {
    url: string;
    init: RequestInit | undefined;
}

function stubFetch(response: unknown, status = 200): { calls: Captured[]; restore: () => void } {
    const calls: Captured[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url, init });
        return new Response(JSON.stringify(response), {
            status,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;
    return { calls, restore: () => (globalThis.fetch = original) };
}

function resetEnv(): void {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_CHECKOUT_URL;
}

test('checkout falls back to the mock URL when Stripe is not configured', async () => {
    resetEnv();
    const stub = stubFetch({});
    try {
        const session = await createCheckoutSession({
            userId: 'user-mock',
            planCode: 'canopy_pro_monthly',
        });
        assert.equal(session.live, false);
        assert.match(session.redirectUrl, /mock-session|checkout\.stripe\.com/);
        assert.equal(stub.calls.length, 0, 'no Stripe API call in mock mode');
    } finally {
        stub.restore();
    }
});

test('checkout creates a real Stripe session when configured', async () => {
    resetEnv();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_PRICE_CANOPY_PRO_MONTHLY = 'price_abc';
    process.env.STRIPE_CHECKOUT_SUCCESS_URL = 'https://app.example/success';
    process.env.STRIPE_CHECKOUT_CANCEL_URL = 'https://app.example/cancel';
    const stub = stubFetch({ id: 'cs_live_1', url: 'https://checkout.stripe.com/c/pay/cs_live_1' });
    try {
        const session = await createCheckoutSession({
            userId: 'user-live',
            planCode: 'canopy_pro_monthly',
        });
        assert.equal(session.live, true);
        assert.equal(session.sessionId, 'cs_live_1');
        assert.equal(session.redirectUrl, 'https://checkout.stripe.com/c/pay/cs_live_1');
        assert.equal(stub.calls.length, 1);
        assert.match(stub.calls[0]!.url, /api\.stripe\.com\/v1\/checkout\/sessions/);
        const body = String(stub.calls[0]!.init?.body ?? '');
        assert.match(body, /line_items%5B0%5D%5Bprice%5D=price_abc/);
        assert.match(body, /client_reference_id=user-live/);
    } finally {
        stub.restore();
    }
});

test('live checkout without a configured price id throws', async () => {
    resetEnv();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_CHECKOUT_SUCCESS_URL = 'https://app.example/success';
    process.env.STRIPE_CHECKOUT_CANCEL_URL = 'https://app.example/cancel';
    const stub = stubFetch({});
    try {
        await assert.rejects(
            createCheckoutSession({ userId: 'u', planCode: 'canopy_sprout_monthly' }),
            /no Stripe price configured/
        );
    } finally {
        stub.restore();
    }
});

test('portal uses the mock path while the customer id is still fabricated', async () => {
    resetEnv();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    const stub = stubFetch({ url: 'https://billing.stripe.com/p/session/live' });
    try {
        // A brand-new user's stored stripeCustomerId is the fabricated
        // `cus_<userId>`, so live portal must not fire until a real cus_ syncs.
        const portal = await createCustomerPortalSession('portal-user');
        assert.equal(portal.live, false);
        assert.equal(stub.calls.length, 0);
    } finally {
        stub.restore();
    }
});
