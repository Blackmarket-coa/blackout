import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEnv, evaluateHttp, summarize } from './monetization-go-live-preflight.mjs';

const levelOf = (findings, check) => findings.filter((f) => f.check === check).map((f) => f.level);

const GOOD_PROD_ENV = {
    NODE_ENV: 'production',
    FREEBLACKMARKET_ENABLED: 'true',
    FREEBLACKMARKET_API_KEY: 'fbm_live_key',
    FREEBLACKMARKET_WEBHOOK_SECRET: 'whsec_x',
    FREEBLACKMARKET_BASE_URL: 'https://api.freeblackmarket.com',
    STRIPE_SECRET_KEY: 'sk_live_x',
    STRIPE_CHECKOUT_SUCCESS_URL: 'https://app.theblackout.app/billing/success',
    STRIPE_CHECKOUT_CANCEL_URL: 'https://app.theblackout.app/billing/cancel',
    STRIPE_WEBHOOK_SECRET: 'whsec_stripe',
    STRIPE_PRICE_CANOPY_SPROUT_MONTHLY: 'price_1',
    STRIPE_PRICE_CANOPY_SPROUT_ANNUAL: 'price_2',
    STRIPE_PRICE_CANOPY_PRO_MONTHLY: 'price_3',
    STRIPE_PRICE_CANOPY_PRO_ANNUAL: 'price_4',
    BLACKOUT_MONETIZATION_MARKETPLACE: 'true',
    BLACKOUT_BETA_UNLOCK_ALL: 'false',
    VITE_BLACKOUT_BETA_UNLOCK_ALL: 'false',
};

test('a fully configured production env passes with zero failures', () => {
    const findings = evaluateEnv(GOOD_PROD_ENV, { charge: true });
    assert.equal(summarize(findings).FAIL, 0);
    assert.deepEqual(levelOf(findings, 'beta-unlock'), ['PASS']);
});

test('missing FBM secrets fail (mirrors the production boot guard)', () => {
    const findings = evaluateEnv({
        ...GOOD_PROD_ENV,
        FREEBLACKMARKET_API_KEY: undefined,
        FREEBLACKMARKET_WEBHOOK_SECRET: undefined,
    });
    assert.deepEqual(levelOf(findings, 'fbm-api-key'), ['FAIL']);
    assert.deepEqual(levelOf(findings, 'fbm-webhook-secret'), ['FAIL']);
});

test('the stub and placeholder providers are hard failures', () => {
    const findings = evaluateEnv({
        ...GOOD_PROD_ENV,
        FREEBLACKMARKET_STUB: '1',
        BLAMAZON_ENABLED: 'true',
    });
    assert.deepEqual(levelOf(findings, 'fbm-stub'), ['FAIL']);
    assert.ok(findings.some((f) => f.check === 'placeholder-provider' && f.level === 'FAIL'));
});

test('a plaintext FBM base URL fails', () => {
    const findings = evaluateEnv({
        ...GOOD_PROD_ENV,
        FREEBLACKMARKET_BASE_URL: 'http://api.freeblackmarket.com',
    });
    assert.deepEqual(levelOf(findings, 'fbm-base-url'), ['FAIL']);
});

test('beta-unlock still on: warn normally, fail under --charge', () => {
    const env = { ...GOOD_PROD_ENV, BLACKOUT_BETA_UNLOCK_ALL: 'true' };
    assert.deepEqual(levelOf(evaluateEnv(env), 'beta-unlock'), ['WARN']);
    assert.deepEqual(levelOf(evaluateEnv(env, { charge: true }), 'beta-unlock'), ['FAIL']);
});

test('missing Stripe key is a warning (mock checkout), missing return URLs with a key is a failure', () => {
    const noStripe = evaluateEnv({ ...GOOD_PROD_ENV, STRIPE_SECRET_KEY: undefined });
    assert.deepEqual(levelOf(noStripe, 'stripe-secret'), ['WARN']);
    const noUrls = evaluateEnv({ ...GOOD_PROD_ENV, STRIPE_CHECKOUT_SUCCESS_URL: undefined });
    assert.deepEqual(levelOf(noUrls, 'stripe-return-urls'), ['FAIL']);
});

// --- HTTP mode, against a fake stack ---------------------------------------

const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

function fakeStack({ listings, webhookStatus = 401, providers }) {
    return async (rawUrl, init) => {
        const { pathname } = new URL(rawUrl);
        if (pathname === '/health') return jsonResponse(200, { ok: true });
        if (pathname === '/v1/marketplace/listings') return jsonResponse(200, { listings });
        if (pathname === '/v1/creator/providers') {
            return jsonResponse(200, {
                providers: providers ?? [
                    { id: 'freeblackmarket', capabilities: ['catalog', 'creator-write'] },
                ],
            });
        }
        if (pathname === '/v1/marketplace/webhooks/freeblackmarket' && init?.method === 'POST') {
            return jsonResponse(webhookStatus, {});
        }
        return jsonResponse(404, {});
    };
}

const REAL_ROWS = [
    {
        providerListingId: 'fbm-privacy-tools',
        featureKeys: ['features.hardening.imagePerturbation'],
    },
    { providerListingId: 'fbm-theme-nightfall', featureKeys: [] },
];

test('a healthy live stack passes HTTP mode', async () => {
    const findings = await evaluateHttp('https://api.example.test', {
        fetchImpl: fakeStack({ listings: REAL_ROWS }),
    });
    assert.equal(summarize(findings).FAIL, 0);
    assert.deepEqual(levelOf(findings, 'webhook-signature'), ['PASS']);
    assert.deepEqual(levelOf(findings, 'seller-surface'), ['PASS']);
});

test('stub catalog rows warn normally and fail under --charge', async () => {
    const stubRows = [{ providerListingId: 'stub-stickers-cats', featureKeys: [] }];
    const relaxed = await evaluateHttp('https://api.example.test', {
        fetchImpl: fakeStack({ listings: stubRows }),
    });
    assert.deepEqual(levelOf(relaxed, 'catalog-stub'), ['WARN']);
    const strict = await evaluateHttp('https://api.example.test', {
        charge: true,
        fetchImpl: fakeStack({ listings: stubRows }),
    });
    assert.deepEqual(levelOf(strict, 'catalog-stub'), ['FAIL']);
});

test('an unsigned webhook being accepted is a failure', async () => {
    const findings = await evaluateHttp('https://api.example.test', {
        fetchImpl: fakeStack({ listings: REAL_ROWS, webhookStatus: 200 }),
    });
    assert.deepEqual(levelOf(findings, 'webhook-signature'), ['FAIL']);
});

test('a missing creator-write provider fails the seller surface check', async () => {
    const findings = await evaluateHttp('https://api.example.test', {
        fetchImpl: fakeStack({
            listings: REAL_ROWS,
            providers: [{ id: 'freeblackmarket', capabilities: ['catalog'] }],
        }),
    });
    assert.deepEqual(levelOf(findings, 'seller-surface'), ['FAIL']);
});
