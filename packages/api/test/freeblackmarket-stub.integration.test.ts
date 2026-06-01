import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.FREEBLACKMARKET_STUB = '1';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET =
    process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? 'stub-webhook-secret';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const {
    resetMarketplaceEntitlementsForTest,
    listEntitlementsForUser,
} = await import('../src/services/marketplaceEntitlements');
const { resetMarketplaceRegistry, getMarketplaceProvider } = await import(
    '../src/integrations/marketplace'
);
const { getFreeblackmarketStubInternals } = await import(
    '../src/integrations/marketplace/freeblackmarketStub'
);

const USER_ID = 'stub-user';

function authHeaders(): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(USER_ID, 'stub-tester', 600)}`,
        'content-type': 'application/json',
    };
}

function resetAll() {
    resetMarketplaceEntitlementsForTest();
    resetMarketplaceRegistry();
    const provider = getMarketplaceProvider('freeblackmarket');
    if (provider) getFreeblackmarketStubInternals(provider)?.reset();
}

test('stub provider: catalog returns seeded listings', async () => {
    resetAll();
    const response = await app.request('/v1/marketplace/listings?providerId=freeblackmarket', {
        headers: authHeaders(),
    });
    assert.equal(response.status, 200);
    const json = (await response.json()) as { listings: Array<{ providerListingId: string }> };
    const ids = json.listings.map((l) => l.providerListingId);
    assert.ok(ids.includes('stub-theme-noir'));
    assert.ok(ids.includes('stub-stickers-cats'));
    assert.ok(ids.includes('stub-plugin-todo'));
    assert.ok(ids.includes('stub-privacy-tools-advanced'));
    // Black Market privacy SKUs added in PR (Burner Pro / Ephemeral Pro / Data-Deletion Pro /
    // Stego Advanced / Sovereignty Bundle).
    assert.ok(ids.includes('stub-burner-pro'));
    assert.ok(ids.includes('stub-ephemeral-pro'));
    assert.ok(ids.includes('stub-data-deletion-pro'));
    assert.ok(ids.includes('stub-stego-advanced'));
    assert.ok(ids.includes('stub-sovereignty-bundle'));
    // New plugin-shelf demo listings.
    assert.ok(ids.includes('stub-plugin-uptime-monitor'));
    assert.ok(ids.includes('stub-plugin-poll-helper'));
    assert.ok(ids.includes('stub-automation-welcome-bot'));
});

test('stub provider: artifactKind filter returns only listings of that kind', async () => {
    resetAll();
    const response = await app.request(
        '/v1/marketplace/listings?providerId=freeblackmarket&artifactKind=manifest_plugin',
        { headers: authHeaders() },
    );
    assert.equal(response.status, 200);
    const json = (await response.json()) as {
        listings: Array<{ providerListingId: string; artifactKind?: string }>;
    };
    assert.ok(json.listings.length > 0);
    for (const listing of json.listings) {
        assert.equal(listing.artifactKind, 'manifest_plugin');
    }
    const ids = json.listings.map((l) => l.providerListingId);
    assert.ok(ids.includes('stub-plugin-todo'));
    assert.ok(ids.includes('stub-plugin-poll-helper'));
    // Listings of other kinds are excluded.
    assert.ok(!ids.includes('stub-theme-noir'));
    assert.ok(!ids.includes('stub-plugin-uptime-monitor'));
});

test('stub provider: full checkout round-trip grants entitlement and serves signed bundle', async () => {
    resetAll();
    // 1. Create checkout session (embed mode).
    const checkoutResponse = await app.request('/v1/marketplace/checkout', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            listingId: 'stub-stickers-cats',
            embed: true,
        }),
    });
    assert.equal(checkoutResponse.status, 200);
    const checkoutJson = (await checkoutResponse.json()) as {
        sessionId: string;
        embed: boolean;
        redirectUrl: string;
    };
    assert.equal(checkoutJson.embed, true);
    assert.match(checkoutJson.redirectUrl, /\/v1\/marketplace\/stub\/checkout\//);

    // 2. Stub embed page renders with postMessage hooks.
    const embedResponse = await app.request(
        `/v1/marketplace/stub/checkout/${checkoutJson.sessionId}`
    );
    assert.equal(embedResponse.status, 200);
    const html = await embedResponse.text();
    assert.match(html, /postMessage\(\{ type: 'checkout\.completed'/);

    // 3. "Complete purchase" — drives a real signed webhook into the canonical handler.
    const completeResponse = await app.request(
        `/v1/marketplace/stub/checkout/${checkoutJson.sessionId}/complete`,
        { method: 'POST' }
    );
    assert.equal(completeResponse.status, 200);
    const completeJson = (await completeResponse.json()) as {
        ok: boolean;
        entitlementId?: string;
    };
    assert.equal(completeJson.ok, true);
    assert.ok(completeJson.entitlementId);

    // 4. Entitlement was granted to the buyer.
    const entitlements = listEntitlementsForUser(USER_ID);
    assert.equal(entitlements.length, 1);
    assert.equal(entitlements[0]!.providerListingId, 'stub-stickers-cats');
    assert.equal(entitlements[0]!.status, 'granted');

    // 5. Signed bundle endpoint returns a SignedPluginBundle envelope.
    const bundleResponse = await app.request(
        `/v1/marketplace/fulfillment/${entitlements[0]!.id}/bundle`,
        { headers: authHeaders() }
    );
    assert.equal(bundleResponse.status, 200);
    const bundle = (await bundleResponse.json()) as {
        manifest: { id: string; sha256: string; artifactKind: string };
        bundleBase64: string;
        signature: { keyId: string; signature: string; manifestSha256: string };
    };
    assert.equal(bundle.signature.keyId, 'fbm-dev-hmac');
    assert.equal(bundle.manifest.artifactKind, 'asset_bundle');
    assert.ok(bundle.bundleBase64.length > 0);
    assert.equal(bundle.manifest.sha256.length, 64);
    assert.equal(bundle.signature.manifestSha256.length, 64);
});

test('stub provider: creator listing flow seeds a new draft into the catalog', async () => {
    resetAll();
    const draftResponse = await app.request('/v1/creator/listings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            artifactKind: 'theme',
            category: 'plugin-curated',
            entitlementKind: 'plugin_flag',
            title: 'Sunset Theme',
            description: 'Warm gradient theme',
            priceCents: 0,
            currency: 'USD',
            artifactPayload: { palette: { background: '#fff', accent: '#f60' } },
        }),
    });
    assert.equal(draftResponse.status, 201);
    const draft = (await draftResponse.json()) as {
        listing: { id: string; providerListingId: string; status: string };
    };
    assert.equal(draft.listing.status, 'draft');
    assert.match(draft.listing.providerListingId, /^stub-/);

    // Drafts: query the catalog through the provider directly (bypasses cache).
    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider, 'provider should be registered');
    const draftCatalog = await provider!.fetchCatalog({});
    assert.equal(
        draftCatalog.find((l) => l.providerListingId === draft.listing.providerListingId),
        undefined,
        'draft must not appear in the public catalog'
    );

    // Publish.
    const publishResult = await app.request(
        `/v1/creator/listings/${draft.listing.id}/publish`,
        {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({}),
        }
    );
    assert.equal(publishResult.status, 200);
    const publishJson = (await publishResult.json()) as {
        listing: { status: string } | null;
    };
    assert.equal(publishJson.listing?.status, 'published');

    // Catalog now exposes the published listing (via direct provider call to
    // bypass the listings cache).
    const publishedCatalog = await provider!.fetchCatalog({});
    assert.ok(
        publishedCatalog.some(
            (l) => l.providerListingId === draft.listing.providerListingId
        ),
        'published draft should appear in catalog'
    );
});

test('stub provider: privacy_tool purchase carries the features array onto the entitlement', async () => {
    resetAll();
    const checkoutResponse = await app.request('/v1/marketplace/checkout', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            listingId: 'stub-privacy-tools-advanced',
            embed: true,
        }),
    });
    assert.equal(checkoutResponse.status, 200);
    const { sessionId } = (await checkoutResponse.json()) as { sessionId: string };

    const completeResponse = await app.request(
        `/v1/marketplace/stub/checkout/${sessionId}/complete`,
        { method: 'POST' }
    );
    assert.equal(completeResponse.status, 200);

    const entitlements = listEntitlementsForUser(USER_ID);
    assert.equal(entitlements.length, 1);
    const ent = entitlements[0]!;
    assert.equal(ent.kind, 'privacy_tool');
    assert.deepEqual(ent.metadata['features'], ['perturbation', 'exif_strip', 'link_sanitize']);
});

test('stub provider: completes only when the session exists', async () => {
    resetAll();
    const response = await app.request(
        '/v1/marketplace/stub/checkout/non-existent-session/complete',
        { method: 'POST' }
    );
    assert.equal(response.status, 404);
});
