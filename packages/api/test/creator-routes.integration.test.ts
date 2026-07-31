import test from 'node:test';
import assert from 'node:assert/strict';

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
// URL assertions below expect the default commerce prefix; an ambient value
// (e.g. a deploy .env loaded into the shell) must not leak into the suite.
delete process.env.FREEBLACKMARKET_API_PREFIX;

interface FetchCall {
    url: string;
    init: RequestInit | undefined;
    bodyText?: string;
}

const fetchCalls: FetchCall[] = [];
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchHandler: FetchHandler = () =>
    new Response(JSON.stringify({}), {
        headers: { 'content-type': 'application/json' },
    });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    let bodyText: string | undefined;
    if (init?.body && typeof init.body === 'string') bodyText = init.body;
    fetchCalls.push({ url, init, bodyText });
    return await fetchHandler(url, init);
}) as typeof fetch;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { _resetCreatorListingsForTest } = await import('../src/services/creatorListings');

const USER_ID = 'creator-user-1';
const USERNAME = 'creator-tester';

function authHeaders(): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(USER_ID, USERNAME, 600)}`,
        'content-type': 'application/json',
    };
}

function resetForEachTest(): void {
    _resetCreatorListingsForTest();
    fetchCalls.length = 0;
}

test('GET /v1/creator/providers lists creator-write providers', async () => {
    resetForEachTest();
    const response = await app.request('/v1/creator/providers', {
        method: 'GET',
        headers: authHeaders(),
    });
    assert.equal(response.status, 200);
    const json = (await response.json()) as {
        providers: Array<{ id: string; capabilities: string[] }>;
    };
    const fbm = json.providers.find((p) => p.id === 'freeblackmarket');
    assert.ok(fbm, 'freeblackmarket provider should be advertised');
    assert.ok(fbm!.capabilities.includes('creator-write'));
});

test('POST /v1/creator/listings creates a draft via the upstream provider', async () => {
    resetForEachTest();
    fetchHandler = () =>
        new Response(
            JSON.stringify({ id: 'fbm-listing-1', slug: 'cool-stickers', status: 'draft' }),
            { headers: { 'content-type': 'application/json' } }
        );
    const response = await app.request('/v1/creator/listings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            artifactKind: 'asset_bundle',
            category: 'emoji-sticker',
            entitlementKind: 'asset_bundle',
            title: 'Cool stickers',
            description: 'A pack of cool stickers',
            priceCents: 199,
            currency: 'USD',
            artifactPayload: { files: [] },
        }),
    });
    assert.equal(response.status, 201);
    const json = (await response.json()) as {
        listing: { providerListingId: string; status: string; title: string };
    };
    assert.equal(json.listing.title, 'Cool stickers');
    assert.equal(json.listing.providerListingId, 'fbm-listing-1');
    assert.equal(json.listing.status, 'draft');
    const sellerCalls = fetchCalls.filter((c) =>
        c.url.endsWith('/v1/integrations/blackout/commerce/seller/listings')
    );
    assert.equal(sellerCalls.length, 1);
});

test('POST /v1/creator/listings accepts a privacy_tool draft', async () => {
    resetForEachTest();
    fetchHandler = () =>
        new Response(
            JSON.stringify({ id: 'fbm-listing-priv', slug: 'privacy-tools', status: 'draft' }),
            { headers: { 'content-type': 'application/json' } }
        );
    const response = await app.request('/v1/creator/listings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            artifactKind: 'privacy_tool',
            category: 'security-tool',
            entitlementKind: 'privacy_tool',
            title: 'Privacy Tools — Advanced',
            description: 'Advanced EXIF stripping and link sanitization',
            priceCents: 299,
            currency: 'USD',
            artifactPayload: { tier: 'advanced', features: ['exif_strip', 'link_sanitize'] },
        }),
    });
    assert.equal(response.status, 201);
    const json = (await response.json()) as { listing: { providerListingId: string } };
    assert.equal(json.listing.providerListingId, 'fbm-listing-priv');
});

test('POST /v1/creator/listings rejects invalid drafts', async () => {
    resetForEachTest();
    const response = await app.request('/v1/creator/listings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            artifactKind: 'mystery',
            category: 'emoji-sticker',
            entitlementKind: 'asset_bundle',
            title: 'x',
            description: 'y',
            priceCents: 0,
            currency: 'USD',
        }),
    });
    assert.equal(response.status, 400);
});

test("GET /v1/creator/listings/mine returns the caller's listings only", async () => {
    resetForEachTest();
    fetchHandler = () =>
        new Response(JSON.stringify({ id: 'fbm-listing-2', slug: 'theme-x', status: 'draft' }), {
            headers: { 'content-type': 'application/json' },
        });
    await app.request('/v1/creator/listings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            artifactKind: 'theme',
            category: 'plugin-curated',
            entitlementKind: 'plugin_flag',
            title: 'Theme X',
            description: 'Sleek theme',
            priceCents: 0,
            currency: 'USD',
            artifactPayload: { palette: {} },
        }),
    });
    const response = await app.request('/v1/creator/listings/mine', {
        method: 'GET',
        headers: authHeaders(),
    });
    assert.equal(response.status, 200);
    const json = (await response.json()) as { listings: Array<{ title: string }> };
    assert.equal(json.listings.length, 1);
    assert.equal(json.listings[0]!.title, 'Theme X');
});

test('POST /v1/creator/listings returns 502 when the upstream provider fails', async () => {
    resetForEachTest();
    fetchHandler = () =>
        new Response(JSON.stringify({ error: 'boom' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
        });
    const response = await app.request('/v1/creator/listings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            artifactKind: 'theme',
            category: 'plugin-curated',
            entitlementKind: 'plugin_flag',
            title: 'Theme Y',
            description: 'Another theme',
            priceCents: 0,
            currency: 'USD',
            artifactPayload: {},
        }),
    });
    assert.equal(response.status, 502);
    const json = (await response.json()) as { code: string };
    assert.equal(json.code, 'upstream_failed');
});

test('POST /v1/creator/listings rejects coalition_kit artifacts with 400', async () => {
    resetForEachTest();
    const response = await app.request('/v1/creator/listings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            artifactKind: 'coalition_kit',
            category: 'community-template',
            entitlementKind: 'community_template',
            title: 'Coalition starter',
            description: 'A kit',
            priceCents: 0,
            currency: 'USD',
            artifactPayload: {},
        }),
    });
    assert.equal(response.status, 400);
    const json = (await response.json()) as { code: string };
    assert.equal(json.code, 'unsupported_artifact');
});

test('POST /v1/creator/listings/:id/publish publishes an owned listing', async () => {
    resetForEachTest();
    fetchHandler = (url) => {
        if (url.endsWith('/publish')) {
            return new Response(
                JSON.stringify({ id: 'fbm-pub-1', slug: 'pub-theme', status: 'published' }),
                { headers: { 'content-type': 'application/json' } }
            );
        }
        return new Response(
            JSON.stringify({ id: 'fbm-pub-1', slug: 'pub-theme', status: 'draft' }),
            { headers: { 'content-type': 'application/json' } }
        );
    };
    const created = await app.request('/v1/creator/listings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            artifactKind: 'theme',
            category: 'plugin-curated',
            entitlementKind: 'plugin_flag',
            title: 'Publishable theme',
            description: 'desc',
            priceCents: 0,
            currency: 'USD',
            artifactPayload: {},
        }),
    });
    const { listing } = (await created.json()) as { listing: { id: string } };
    const response = await app.request(`/v1/creator/listings/${listing.id}/publish`, {
        method: 'POST',
        headers: authHeaders(),
    });
    assert.equal(response.status, 200);
    const json = (await response.json()) as { listing: { status: string } | null };
    assert.equal(json.listing?.status, 'published');
});

test('POST /v1/creator/listings/:id/publish 404s for an unknown listing', async () => {
    resetForEachTest();
    const response = await app.request('/v1/creator/listings/does-not-exist/publish', {
        method: 'POST',
        headers: authHeaders(),
    });
    assert.equal(response.status, 404);
});

test('DELETE /v1/creator/listings/:id 404s for an unknown listing', async () => {
    resetForEachTest();
    const response = await app.request('/v1/creator/listings/does-not-exist', {
        method: 'DELETE',
        headers: authHeaders(),
    });
    assert.equal(response.status, 404);
});

test('POST /v1/creator/payouts/onboarding returns the provider onboarding handle', async () => {
    resetForEachTest();
    fetchHandler = (url) => {
        if (url.endsWith('/v1/integrations/blackout/commerce/seller/onboarding')) {
            return new Response(
                JSON.stringify({
                    url: 'https://api.freeblackmarket.test/onboard/abc',
                    expiresAt: '2026-01-01T00:00:00Z',
                }),
                { headers: { 'content-type': 'application/json' } }
            );
        }
        return new Response('{}', { headers: { 'content-type': 'application/json' } });
    };
    const response = await app.request('/v1/creator/payouts/onboarding', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ providerId: 'freeblackmarket', returnUrl: 'https://app.test/x' }),
    });
    assert.equal(response.status, 200);
    // Pins the field name the client reads (`onboardingUrl`, not `redirectUrl`).
    const json = (await response.json()) as { onboardingUrl?: string; expiresAt?: string };
    assert.equal(json.onboardingUrl, 'https://api.freeblackmarket.test/onboard/abc');
    assert.equal(json.expiresAt, '2026-01-01T00:00:00Z');
});

test('POST /v1/marketplace/checkout passes embed flag to provider', async () => {
    resetForEachTest();
    fetchHandler = (url) => {
        if (url.includes('/v1/integrations/blackout/commerce/checkout/sessions')) {
            return new Response(
                JSON.stringify({ url: 'https://api.freeblackmarket.test/embed/x', id: 'sess-1' }),
                { headers: { 'content-type': 'application/json' } }
            );
        }
        return new Response('{}', { headers: { 'content-type': 'application/json' } });
    };
    const response = await app.request('/v1/marketplace/checkout', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            listingId: 'lst-1',
            embed: true,
        }),
    });
    assert.equal(response.status, 200);
    const json = (await response.json()) as { embed: boolean };
    assert.equal(json.embed, true);
    const checkoutCall = fetchCalls.find((c) =>
        c.url.includes('/v1/integrations/blackout/commerce/checkout/sessions')
    );
    assert.ok(checkoutCall, 'should have called upstream checkout');
    assert.ok(checkoutCall!.url.includes('embed=1'), 'embed query param should be set');
});
