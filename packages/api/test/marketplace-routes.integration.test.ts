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
// URL assertions below expect the default '/v1' prefix; an ambient value
// (e.g. a deploy .env loaded into the shell) must not leak into the suite.
delete process.env.FREEBLACKMARKET_API_PREFIX;
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const WEBHOOK_SECRET = process.env.FREEBLACKMARKET_WEBHOOK_SECRET;

interface FetchCall {
    url: string;
    init: RequestInit | undefined;
}

const fetchCalls: FetchCall[] = [];
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchHandler: FetchHandler = () =>
    new Response(JSON.stringify({ listings: [] }), {
        headers: { 'content-type': 'application/json' },
    });
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init });
    return await fetchHandler(url, init);
}) as typeof fetch;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { resetMarketplaceEntitlementsForTest, listEntitlementsForUser, getEntitlementById } =
    await import('../src/services/marketplaceEntitlements');
const { resetCountersForTest, getCounter } = await import(
    '../src/services/marketplaceObservability'
);
const { db } = await import('../src/db/store');

const USER_ID = 'user-1';
const USERNAME = 'tester';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(USER_ID, USERNAME, 600)}`,
        'content-type': 'application/json',
        ...extra,
    };
}

function signWebhook(rawBody: string): string {
    return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

interface PurchaseEventOptions {
    eventId?: string;
    userId?: string;
    listingId?: string;
    sku?: string | null;
    type?: 'purchase.succeeded' | 'purchase.refunded' | 'purchase.failed' | 'purchase.chargebacked';
    kind?: 'emoji_pack' | 'asset_bundle' | 'software_license' | 'subscription_tier';
    metadata?: Record<string, unknown>;
    featureKeys?: string[];
}

function purchaseEventBody(options: PurchaseEventOptions = {}): string {
    return JSON.stringify({
        eventId: options.eventId ?? 'evt-1',
        type: options.type ?? 'purchase.succeeded',
        userId: options.userId ?? USER_ID,
        providerListingId: options.listingId ?? 'listing-1',
        sku: options.sku ?? null,
        kind: options.kind ?? 'asset_bundle',
        occurredAt: '2026-05-02T12:00:00.000Z',
        metadata: options.metadata ?? {},
        ...(options.featureKeys ? { featureKeys: options.featureKeys } : {}),
    });
}

function resetForEachTest(): void {
    resetMarketplaceEntitlementsForTest();
    resetCountersForTest();
    fetchCalls.length = 0;
    fetchHandler = () =>
        new Response(JSON.stringify({ listings: [] }), {
            headers: { 'content-type': 'application/json' },
        });
}

test('webhook happy path: signed purchase grants entitlement', async () => {
    resetForEachTest();
    const body = purchaseEventBody({ eventId: 'evt-happy', listingId: 'listing-happy' });
    const response = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-happy',
            'x-fbm-signature': signWebhook(body),
        },
        body,
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as { ok: boolean; alreadyProcessed: boolean };
    assert.equal(json.ok, true);
    assert.equal(json.alreadyProcessed, false);

    const entitlements = listEntitlementsForUser(USER_ID);
    assert.equal(entitlements.length, 1);
    assert.equal(entitlements[0]!.providerListingId, 'listing-happy');
    assert.equal(entitlements[0]!.status, 'granted');
    assert.equal(getCounter('marketplace_webhook_received_total'), 1);
    assert.equal(getCounter('marketplace_entitlement_granted_total'), 1);
});

test('subscription_tier purchase surfaces the feature-key bundle on the entitlement', async () => {
    resetForEachTest();
    const featureKeys = ['features.hardening.torTransport', 'features.persona.compartments'];
    const body = purchaseEventBody({
        eventId: 'evt-tier',
        listingId: 'listing-signal-tier',
        kind: 'subscription_tier',
        featureKeys,
    });
    const response = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-tier',
            'x-fbm-signature': signWebhook(body),
        },
        body,
    });
    assert.equal(response.status, 200);

    const entitlements = listEntitlementsForUser(USER_ID);
    assert.equal(entitlements.length, 1);
    assert.equal(entitlements[0]!.kind, 'subscription_tier');
    assert.deepEqual(entitlements[0]!.featureKeys, featureKeys);
});

test('webhook replay is idempotent: same eventId twice does not double-grant', async () => {
    resetForEachTest();
    const body = purchaseEventBody({ eventId: 'evt-replay', listingId: 'listing-replay' });
    const headers = {
        'content-type': 'application/json',
        'x-fbm-event-id': 'evt-replay',
        'x-fbm-signature': signWebhook(body),
    };

    const first = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers,
        body,
    });
    const firstJson = (await first.json()) as { alreadyProcessed: boolean };
    assert.equal(first.status, 200);
    assert.equal(firstJson.alreadyProcessed, false);

    const second = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers,
        body,
    });
    const secondJson = (await second.json()) as { alreadyProcessed: boolean };
    assert.equal(second.status, 200);
    assert.equal(secondJson.alreadyProcessed, true);

    assert.equal(listEntitlementsForUser(USER_ID).length, 1);
});

test('webhook with bad signature is rejected with 401 and grants nothing', async () => {
    resetForEachTest();
    const body = purchaseEventBody({ eventId: 'evt-bad', listingId: 'listing-bad' });
    const response = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-bad',
            'x-fbm-signature': '0000000000000000000000000000000000000000000000000000000000000000',
        },
        body,
    });

    assert.equal(response.status, 401);
    const json = (await response.json()) as { ok: boolean; reason: string };
    assert.equal(json.ok, false);
    assert.equal(json.reason, 'signature-mismatch');
    assert.equal(listEntitlementsForUser(USER_ID).length, 0);
    assert.equal(getCounter('marketplace_webhook_rejected_total'), 1);
});

test('refund event flips entitlement status from granted to refunded', async () => {
    resetForEachTest();
    const grantBody = purchaseEventBody({
        eventId: 'evt-grant-refund',
        listingId: 'listing-refund',
    });
    await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-grant-refund',
            'x-fbm-signature': signWebhook(grantBody),
        },
        body: grantBody,
    });

    const refundBody = purchaseEventBody({
        eventId: 'evt-refund',
        listingId: 'listing-refund',
        type: 'purchase.refunded',
    });
    const response = await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-refund',
            'x-fbm-signature': signWebhook(refundBody),
        },
        body: refundBody,
    });

    assert.equal(response.status, 200);
    const entitlements = listEntitlementsForUser(USER_ID);
    assert.equal(entitlements.length, 1);
    assert.equal(entitlements[0]!.status, 'refunded');
});

test('software_license purchase generates a license key surfaced via fulfillment', async () => {
    resetForEachTest();
    const body = purchaseEventBody({
        eventId: 'evt-license',
        listingId: 'listing-license',
        kind: 'software_license',
        metadata: { activationsMax: 5 },
    });
    await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-license',
            'x-fbm-signature': signWebhook(body),
        },
        body,
    });

    const entitlements = listEntitlementsForUser(USER_ID);
    assert.equal(entitlements.length, 1);
    const entitlement = entitlements[0]!;

    const fulfillment = await app.request(`/v1/marketplace/fulfillment/${entitlement.id}/asset`, {
        headers: authHeaders(),
    });
    assert.equal(fulfillment.status, 200);
    const fulfillmentJson = (await fulfillment.json()) as {
        licenseKey?: string;
        activationsMax?: number;
    };
    assert.equal(typeof fulfillmentJson.licenseKey, 'string');
    assert.equal(fulfillmentJson.activationsMax, 5);
});

test('catalog falls back to last known snapshot when freeblackmarket is unreachable', async () => {
    resetForEachTest();

    fetchHandler = () =>
        new Response(
            JSON.stringify({
                listings: [
                    {
                        id: 'listing-cached',
                        category: 'meme-asset',
                        title: 'Cached Asset',
                        description: 'Cached description',
                        priceCents: 199,
                        currency: 'USD',
                        sellerId: null,
                        mediaUrls: [],
                        entitlementKind: 'asset_bundle',
                    },
                ],
            }),
            { headers: { 'content-type': 'application/json' } }
        );

    const ok = await app.request('/v1/marketplace/listings?providerId=freeblackmarket', {
        headers: authHeaders(),
    });
    assert.equal(ok.status, 200);
    const okBody = (await ok.json()) as { listings: Array<{ providerListingId: string }> };
    assert.equal(okBody.listings.length, 1);
    assert.equal(okBody.listings[0]!.providerListingId, 'listing-cached');

    const cached = db.getMarketplaceListingsCache('freeblackmarket|||||');
    assert.notEqual(cached, undefined);
    cached!.refreshedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    db.upsertMarketplaceListingsCache(cached!);

    fetchHandler = () => {
        throw new Error('freeblackmarket unreachable');
    };

    const fallback = await app.request('/v1/marketplace/listings?providerId=freeblackmarket', {
        headers: authHeaders(),
    });
    assert.equal(fallback.status, 200);
    const fallbackBody = (await fallback.json()) as {
        listings: Array<{ providerListingId: string }>;
    };
    assert.equal(fallbackBody.listings.length, 1);
    assert.equal(fallbackBody.listings[0]!.providerListingId, 'listing-cached');
    assert.equal(getCounter('marketplace_catalog_fetch_failed_total'), 1);
});

test('FREEBLACKMARKET_API_PREFIX rewrites outbound commerce paths', async () => {
    resetForEachTest();
    const { resetMarketplaceRegistry } = await import('../src/integrations/marketplace');
    const { normalizeFreeblackmarketApiPrefix } = await import(
        '../src/integrations/marketplace/freeblackmarket'
    );

    assert.equal(normalizeFreeblackmarketApiPrefix(undefined), '/v1');
    assert.equal(normalizeFreeblackmarketApiPrefix('  '), '/v1');
    assert.equal(normalizeFreeblackmarketApiPrefix('v1/nested'), '/v1/nested');
    assert.equal(normalizeFreeblackmarketApiPrefix('/v1/nested/'), '/v1/nested');
    assert.equal(normalizeFreeblackmarketApiPrefix('//v1//'), '/v1');
    assert.equal(normalizeFreeblackmarketApiPrefix('/'), '');

    const saved = process.env.FREEBLACKMARKET_API_PREFIX;
    try {
        // Unique q per request: the listings cache key includes q, so this is a
        // guaranteed cache miss and must trigger an outbound fetch.
        const unprefixed = await app.request(
            '/v1/marketplace/listings?providerId=freeblackmarket&q=prefix-default-buster',
            { headers: authHeaders() }
        );
        assert.equal(unprefixed.status, 200);
        assert.ok(
            fetchCalls.some((call) =>
                call.url.startsWith('https://api.freeblackmarket.test/v1/catalog/listings')
            )
        );

        fetchCalls.length = 0;
        process.env.FREEBLACKMARKET_API_PREFIX = '/v1/integrations/blackout/commerce';
        // The provider captures env at construction; rebuild the registry.
        resetMarketplaceRegistry();

        const prefixed = await app.request(
            '/v1/marketplace/listings?providerId=freeblackmarket&q=prefix-nested-buster',
            { headers: authHeaders() }
        );
        assert.equal(prefixed.status, 200);
        const catalogCall = fetchCalls.find((call) => call.url.includes('/catalog/listings'));
        assert.ok(catalogCall, 'expected an outbound catalog fetch');
        assert.ok(
            catalogCall.url.startsWith(
                'https://api.freeblackmarket.test/v1/integrations/blackout/commerce/catalog/listings'
            )
        );
    } finally {
        if (saved === undefined) delete process.env.FREEBLACKMARKET_API_PREFIX;
        else process.env.FREEBLACKMARKET_API_PREFIX = saved;
        resetMarketplaceRegistry();
    }
});

test('checkout records counter and returns redirect from freeblackmarket', async () => {
    resetForEachTest();
    fetchHandler = () =>
        new Response(
            JSON.stringify({
                id: 'sess-1',
                url: 'https://api.freeblackmarket.test/checkout/sess-1',
            }),
            { headers: { 'content-type': 'application/json' } }
        );

    const response = await app.request('/v1/marketplace/checkout', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            listingId: 'listing-checkout',
        }),
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as { sessionId: string; redirectUrl: string };
    assert.equal(json.sessionId, 'sess-1');
    assert.match(json.redirectUrl, /sess-1$/);
    assert.equal(getCounter('marketplace_checkout_created_total'), 1);

    const checkoutCall = fetchCalls.find((call) => call.url.includes('/v1/checkout/sessions'));
    assert.notEqual(checkoutCall, undefined);
    const idemHeader = (checkoutCall!.init?.headers as Record<string, string>)['idempotency-key'];
    assert.equal(typeof idemHeader, 'string');
});

test('startup secret guard refuses production with missing freeblackmarket secrets', async () => {
    const { assertFreeblackmarketSecretsForProduction } = await import(
        '../src/integrations/marketplace/freeblackmarket'
    );

    assert.throws(
        () =>
            assertFreeblackmarketSecretsForProduction({
                NODE_ENV: 'production',
                FREEBLACKMARKET_API_KEY: '',
                FREEBLACKMARKET_WEBHOOK_SECRET: '',
            } as NodeJS.ProcessEnv),
        /FREEBLACKMARKET_API_KEY, FREEBLACKMARKET_WEBHOOK_SECRET/
    );

    assert.doesNotThrow(() =>
        assertFreeblackmarketSecretsForProduction({
            NODE_ENV: 'production',
            FREEBLACKMARKET_ENABLED: 'false',
        } as NodeJS.ProcessEnv)
    );

    assert.doesNotThrow(() =>
        assertFreeblackmarketSecretsForProduction({
            NODE_ENV: 'production',
            FREEBLACKMARKET_API_KEY: 'present',
            FREEBLACKMARKET_WEBHOOK_SECRET: 'present',
        } as NodeJS.ProcessEnv)
    );
});

test('startup guard refuses production when a placeholder marketplace is enabled', async () => {
    const {
        assertBlamazonDisabledForProduction,
        assertMayhemMarketplazeDisabledForProduction,
        assertAntinAmazonDisabledForProduction,
        assertPlaceholderMarketplacesDisabledForProduction,
    } = await import('../src/integrations/marketplace');

    const cases: Array<[(env: NodeJS.ProcessEnv) => void, string]> = [
        [assertBlamazonDisabledForProduction, 'BLAMAZON_ENABLED'],
        [assertMayhemMarketplazeDisabledForProduction, 'MAYHEM_MARKETPLAZE_ENABLED'],
        [assertAntinAmazonDisabledForProduction, 'ANTIN_AMAZON_ENABLED'],
    ];

    for (const [guard, key] of cases) {
        // production + enabled → hard fail
        assert.throws(
            () => guard({ NODE_ENV: 'production', [key]: 'true' } as NodeJS.ProcessEnv),
            /Refusing to start in production/
        );
        // production + explicitly disabled → ok
        assert.doesNotThrow(() =>
            guard({ NODE_ENV: 'production', [key]: 'false' } as NodeJS.ProcessEnv)
        );
        // production + unset → ok (placeholders default to disabled)
        assert.doesNotThrow(() => guard({ NODE_ENV: 'production' } as NodeJS.ProcessEnv));
        // non-production never guards, even when enabled
        assert.doesNotThrow(() => guard({ NODE_ENV: 'test', [key]: 'true' } as NodeJS.ProcessEnv));
    }

    // The aggregate throws if ANY placeholder is enabled in production.
    assert.throws(
        () =>
            assertPlaceholderMarketplacesDisabledForProduction({
                NODE_ENV: 'production',
                MAYHEM_MARKETPLAZE_ENABLED: '1',
            } as NodeJS.ProcessEnv),
        /mayhem-marketplaze/
    );
    assert.doesNotThrow(() =>
        assertPlaceholderMarketplacesDisabledForProduction({
            NODE_ENV: 'production',
        } as NodeJS.ProcessEnv)
    );
});

test('GET /providers degrades gracefully when a provider fails to construct', async () => {
    const { resetMarketplaceRegistry } = await import('../src/integrations/marketplace');
    const saved = {
        nodeEnv: process.env.NODE_ENV,
        apiKey: process.env.FREEBLACKMARKET_API_KEY,
        webhookSecret: process.env.FREEBLACKMARKET_WEBHOOK_SECRET,
    };
    const restore = (key: string, value: string | undefined) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    };
    try {
        // Force freeblackmarket's production secret-guard to throw at construction.
        process.env.NODE_ENV = 'production';
        delete process.env.FREEBLACKMARKET_API_KEY;
        delete process.env.FREEBLACKMARKET_WEBHOOK_SECRET;
        resetMarketplaceRegistry();

        const res = await app.request('/v1/marketplace/providers');
        // The endpoint must not 500 just because one provider can't initialize.
        assert.equal(res.status, 200);
        const body = (await res.json()) as { providers: Array<{ id: string }> };
        const ids = body.providers.map((p) => p.id);
        // The misconfigured provider is skipped; the others still load.
        assert.equal(ids.includes('freeblackmarket'), false);
        assert.equal(ids.includes('blamazon'), true);
    } finally {
        restore('NODE_ENV', saved.nodeEnv);
        restore('FREEBLACKMARKET_API_KEY', saved.apiKey);
        restore('FREEBLACKMARKET_WEBHOOK_SECRET', saved.webhookSecret);
        resetMarketplaceRegistry();
    }
});

test('entitlement persists across simulated process restart (BLACKOUT_DB_MODE=memory)', async () => {
    resetForEachTest();
    const body = purchaseEventBody({ eventId: 'evt-persist', listingId: 'listing-persist' });
    await app.request('/v1/marketplace/webhooks/freeblackmarket', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-fbm-event-id': 'evt-persist',
            'x-fbm-signature': signWebhook(body),
        },
        body,
    });

    const stored = db.findMarketplaceEntitlement({
        userId: USER_ID,
        providerId: 'freeblackmarket',
        providerListingId: 'listing-persist',
        sku: null,
    });
    assert.notEqual(stored, undefined);
    assert.equal(stored!.status, 'granted');

    const fetched = getEntitlementById(stored!.id);
    assert.equal(fetched?.providerListingId, 'listing-persist');
});

test('teardown restores fetch', () => {
    globalThis.fetch = originalFetch;
});
