// Regression guard for the FBM §5 commerce contract. The real `freeblackmarket`
// provider must call FBM's Blackout integration surface
// (`/v1/integrations/blackout/commerce/**`), NOT the bare work-order paths.
// Those bare paths 404 (catalog/onboarding) or collide with FBM's public
// storefront / seller-JWT routes (checkout/seller-listings) — silently breaking
// the real go-live path while the in-memory stub keeps local/CI green.
// See free-black-market/docs/contracts/blackout-integration.md (§5).

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.FREEBLACKMARKET_ENABLED = 'true';
process.env.FREEBLACKMARKET_API_KEY = 'fbm_test_key';
process.env.FREEBLACKMARKET_BASE_URL = 'https://fbm.example.test';
// PREFIX below is the provider's default; an ambient override (e.g. a deploy
// .env loaded into the shell) must not leak into the suite.
delete process.env.FREEBLACKMARKET_API_PREFIX;

const { createFreeblackmarketProvider } = await import(
    '../src/integrations/marketplace/freeblackmarket'
);

const BASE = 'https://fbm.example.test';
const PREFIX = '/v1/integrations/blackout/commerce';

interface Captured {
    url: string;
    method: string;
    body: string | null;
}

let captured: Captured | null = null;
const realFetch = globalThis.fetch;

function mockFetchReturning(body: unknown): void {
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
        captured = {
            url: String(input),
            method: (init?.method ?? 'GET').toUpperCase(),
            body: typeof init?.body === 'string' ? init.body : null,
        };
        return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;
}

function reset(): void {
    captured = null;
    globalThis.fetch = realFetch;
}

const provider = createFreeblackmarketProvider();

test('fetchCatalog hits the commerce catalog path', async () => {
    mockFetchReturning({ listings: [] });
    try {
        await provider.fetchCatalog({ category: 'security-tool', q: 'x', limit: 10 });
        assert.ok(captured, 'fetch was called');
        const u = new URL(captured!.url);
        assert.equal(u.origin, BASE);
        assert.equal(u.pathname, `${PREFIX}/catalog/listings`);
        assert.equal(u.searchParams.get('category'), 'security-tool');
    } finally {
        reset();
    }
});

test('getListing hits the commerce catalog detail path', async () => {
    mockFetchReturning({ id: 'listing-123' });
    try {
        await provider.getListing('listing-123');
        assert.equal(new URL(captured!.url).pathname, `${PREFIX}/catalog/listings/listing-123`);
    } finally {
        reset();
    }
});

test('createCheckoutSession hits the commerce checkout path', async () => {
    mockFetchReturning({ url: 'https://checkout', id: 'cs_1' });
    try {
        await provider.createCheckoutSession({
            userId: 'u1',
            listingId: 'l1',
            idempotencyKey: 'idem-1',
        });
        const u = new URL(captured!.url);
        assert.equal(u.pathname, `${PREFIX}/checkout/sessions`);
        assert.equal(captured!.method, 'POST');
        // No metadata supplied → the key is omitted from the wire body.
        const body = JSON.parse(captured!.body!) as Record<string, unknown>;
        assert.equal('metadata' in body, false);
    } finally {
        reset();
    }
});

test('createCheckoutSession forwards the metadata echo verbatim (W1b return leg)', async () => {
    mockFetchReturning({ url: 'https://checkout', id: 'cs_3' });
    try {
        await provider.createCheckoutSession({
            userId: 'u1',
            listingId: 'l1',
            idempotencyKey: 'idem-3',
            metadata: { creatorSubscriptionId: 'csub_42', canopyPlanCode: 'sprout_monthly' },
        });
        const body = JSON.parse(captured!.body!) as { metadata?: Record<string, string> };
        assert.deepEqual(body.metadata, {
            creatorSubscriptionId: 'csub_42',
            canopyPlanCode: 'sprout_monthly',
        });
    } finally {
        reset();
    }
});

test('embedded checkout keeps the embed=1 query on the commerce path', async () => {
    mockFetchReturning({ url: 'https://checkout', id: 'cs_2' });
    try {
        await provider.createCheckoutSession({
            userId: 'u1',
            listingId: 'l1',
            idempotencyKey: 'idem-2',
            embed: true,
        });
        const u = new URL(captured!.url);
        assert.equal(u.pathname, `${PREFIX}/checkout/sessions`);
        assert.equal(u.searchParams.get('embed'), '1');
    } finally {
        reset();
    }
});

test('createCreatorListing hits the commerce seller path and reconciles the body', async () => {
    mockFetchReturning({ id: 'l1', slug: 'my-theme', status: 'draft' });
    try {
        await provider.createCreatorListing!({
            sellerUserId: 'seller-1',
            artifactKind: 'theme',
            category: 'creator-asset',
            entitlementKind: 'asset_bundle',
            title: 'My Theme!',
            description: 'A theme',
            priceCents: 500,
            currency: 'USD',
            artifactPayload: { should: 'be dropped' },
        });
        assert.equal(new URL(captured!.url).pathname, `${PREFIX}/seller/listings`);
        const sent = JSON.parse(captured!.body ?? '{}');
        // FBM's route is strict: it requires `slug` and rejects artifact fields.
        assert.equal(sent.slug, 'my-theme');
        assert.equal(sent.title, 'My Theme!');
        assert.ok(!('artifactKind' in sent), 'artifactKind must not be sent');
        assert.ok(!('artifactPayload' in sent), 'artifactPayload must not be sent');
        assert.ok(!('artifactUploadId' in sent), 'artifactUploadId must not be sent');
    } finally {
        reset();
    }
});

test('publishCreatorListing hits the commerce publish path', async () => {
    mockFetchReturning({ id: 'l1', slug: 's', status: 'pending_review' });
    try {
        await provider.publishCreatorListing!('l1');
        assert.equal(new URL(captured!.url).pathname, `${PREFIX}/seller/listings/l1/publish`);
    } finally {
        reset();
    }
});

test('archiveCreatorListing DELETEs the commerce seller path', async () => {
    mockFetchReturning({ ok: true });
    try {
        await provider.archiveCreatorListing!('l1');
        assert.equal(new URL(captured!.url).pathname, `${PREFIX}/seller/listings/l1`);
        assert.equal(captured!.method, 'DELETE');
    } finally {
        reset();
    }
});

test('startCreatorOnboarding hits the commerce onboarding path', async () => {
    mockFetchReturning({ url: 'https://onboard', expiresAt: '2026-01-01T00:00:00Z' });
    try {
        await provider.startCreatorOnboarding!('seller-1', 'https://return');
        assert.equal(new URL(captured!.url).pathname, `${PREFIX}/seller/onboarding`);
    } finally {
        reset();
    }
});

// Manage-session contract (2026-10-06): same credential and mount as the
// checkout mint, strict snake_case body, `{ url, expires_at }` back.
test('createSubscriptionManageSession POSTs the commerce manage-sessions path', async () => {
    let headers: Record<string, string> = {};
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
        captured = {
            url: String(input),
            method: (init?.method ?? 'GET').toUpperCase(),
            body: typeof init?.body === 'string' ? init.body : null,
        };
        headers = (init?.headers ?? {}) as Record<string, string>;
        return new Response(
            JSON.stringify({
                url: `${BASE}${PREFIX}/subscriptions/manage-sessions/tok_abc/page`,
                expires_at: '2026-10-06T12:15:00.000Z',
            }),
            { status: 201, headers: { 'content-type': 'application/json' } }
        );
    }) as typeof fetch;
    try {
        const session = await provider.createSubscriptionManageSession!({
            userId: 'u-manage-1',
            returnUrl: 'https://app.blackout.test/settings',
        });
        const u = new URL(captured!.url);
        assert.equal(u.origin, BASE);
        assert.equal(u.pathname, `${PREFIX}/subscriptions/manage-sessions`);
        assert.equal(captured!.method, 'POST');
        assert.equal(headers.authorization, 'Bearer fbm_test_key');
        assert.equal('idempotency-key' in headers, false);
        assert.deepEqual(JSON.parse(captured!.body!), {
            blackout_user_id: 'u-manage-1',
            return_url: 'https://app.blackout.test/settings',
        });
        assert.deepEqual(session, {
            url: `${BASE}${PREFIX}/subscriptions/manage-sessions/tok_abc/page`,
            expiresAt: '2026-10-06T12:15:00.000Z',
        });
    } finally {
        reset();
    }
});

test('createSubscriptionManageSession leaves return_url out when there is none', async () => {
    mockFetchReturning({
        url: `${BASE}${PREFIX}/subscriptions/manage-sessions/tok_def/page`,
        expires_at: '2026-10-06T12:15:00.000Z',
    });
    try {
        await provider.createSubscriptionManageSession!({ userId: 'u-manage-2' });
        assert.deepEqual(JSON.parse(captured!.body!), { blackout_user_id: 'u-manage-2' });
    } finally {
        reset();
    }
});

test('createSubscriptionManageSession refuses a link off the FBM origin or page path', async () => {
    const page = `${PREFIX}/subscriptions/manage-sessions/tok_abc/page`;
    for (const url of [
        'http://evil.example/page',
        'javascript:alert(1)',
        'not a url',
        // https, but not FREEBLACKMARKET_BASE_URL.
        `https://evil.example${page}`,
        // Right origin, wrong path.
        `${BASE}/somewhere/else`,
        `${BASE}${PREFIX}/subscriptions/manage-sessions//page`,
        `${BASE}${PREFIX}/subscriptions/manage-sessions/a/b/page`,
        // Right page, but with a query or fragment riding along.
        `${BASE}${page}?next=https://evil.example`,
        `${BASE}${page}#x`,
        `https://u:p@fbm.example.test${page}`,
    ]) {
        mockFetchReturning({ url, expires_at: '2026-10-06T12:15:00.000Z' });
        try {
            await assert.rejects(
                provider.createSubscriptionManageSession!({ userId: 'u-manage-3' }),
                (error: Error) => {
                    // The refusal must not echo the link it refused.
                    assert.equal(error.message.includes(url), false);
                    return true;
                }
            );
        } finally {
            reset();
        }
    }
});

test('createSubscriptionManageSession carries FBM body codes on failure', async () => {
    globalThis.fetch = (async () =>
        new Response(JSON.stringify({ code: 'feature_disabled' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
        })) as typeof fetch;
    try {
        await assert.rejects(
            provider.createSubscriptionManageSession!({ userId: 'u-manage-6' }),
            (error: Error & { status?: number; bodyCode?: string }) =>
                error.status === 404 && error.bodyCode === 'feature_disabled'
        );
    } finally {
        reset();
    }
    globalThis.fetch = (async () =>
        new Response('<html>Not Found</html>', { status: 404 })) as typeof fetch;
    try {
        await assert.rejects(
            provider.createSubscriptionManageSession!({ userId: 'u-manage-7' }),
            (error: Error & { status?: number; bodyCode?: string }) =>
                error.status === 404 && error.bodyCode === undefined
        );
    } finally {
        reset();
    }
});

test('createSubscriptionManageSession carries FBM status codes on failure', async () => {
    globalThis.fetch = (async () =>
        new Response(JSON.stringify({ code: 'identity_ambiguous' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
        })) as typeof fetch;
    try {
        await assert.rejects(
            provider.createSubscriptionManageSession!({ userId: 'u-manage-4' }),
            (error: Error & { status?: number }) => error.status === 409
        );
    } finally {
        reset();
    }
});

test('createSubscriptionManageSession refuses to egress without an API key', async () => {
    const savedKey = process.env.FREEBLACKMARKET_API_KEY;
    process.env.FREEBLACKMARKET_API_KEY = '';
    const unconfigured = createFreeblackmarketProvider();
    process.env.FREEBLACKMARKET_API_KEY = savedKey;
    let called = false;
    globalThis.fetch = (async () => {
        called = true;
        return new Response('{}');
    }) as typeof fetch;
    try {
        await assert.rejects(
            unconfigured.createSubscriptionManageSession!({ userId: 'u-manage-5' }),
            (error: Error & { code?: string }) => error.code === 'provider_not_configured'
        );
        assert.equal(called, false);
    } finally {
        reset();
    }
});
