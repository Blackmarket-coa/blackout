// W3: real signed-bundle delivery through the FBM plugin registry. The
// provider resolves an entitled commerce listing to its registry slug, reads
// the public detail + manifest routes, and assembles the exact
// `SignedPluginBundle` shape the client verifier checks. The suite signs with
// a REAL Ed25519 key the way FBM's `signBlackoutEnvelope` does, and re-checks
// the returned bundle the way the client's `verifySignedBundle` does, so the
// hash/signature plumbing is proven end-to-end rather than by echo.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.FREEBLACKMARKET_ENABLED = 'true';
process.env.FREEBLACKMARKET_API_KEY = 'fbm_test_key';
process.env.FREEBLACKMARKET_BASE_URL = 'https://fbm.example.test';
process.env.FREEBLACKMARKET_PUBLISHABLE_KEY = 'pk_test_storefront';
delete process.env.FREEBLACKMARKET_API_PREFIX;

const { createFreeblackmarketProvider } = await import(
    '../src/integrations/marketplace/freeblackmarket'
);

const PREFIX = '/v1/integrations/blackout/commerce';
const SLUG = 'featured-vendor-widget';

// ---- FBM-side fixtures: manifest + envelope built exactly like the platform.

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
        .join(',')}}`;
}

function sha256Hex(input: string | Uint8Array): string {
    return crypto.createHash('sha256').update(input).digest('hex');
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const homepageCard = { title: 'Featured Vendors', to: '/marketplace/featured-vendors', order: 30 };
const dataSource = {
    vendorsUrl: '/store/vendors?featured=true',
    entitlementFeatureKey: 'vendor.promoted_listing',
};
// The declarative payload IS the manifest_plugin "bundle" (extension-manifest.md).
const payloadSha = sha256Hex(canonicalJson({ homepageCard, dataSource }));

const manifest = {
    id: 'coop.fbm.featured-vendor-widget',
    name: 'Featured Vendor Widget',
    version: '1.0.0',
    protocolVersion: 2,
    artifactKind: 'manifest_plugin',
    capabilities: ['http.fetch'],
    listing: { providerId: 'freeblackmarket', providerListingId: 'listing-77', publicSlug: SLUG },
    sha256: payloadSha,
    homepageCard,
    fbm: { minHostVersion: '1.0.0', dataSource },
};

function signEnvelope(manifestSha256: string, bundleSha256: string) {
    const signature = crypto
        .sign(null, Buffer.from(`${manifestSha256}:${bundleSha256}`, 'utf8'), privateKey)
        .toString('base64');
    return {
        keyId: 'fbm-test-key',
        signature,
        manifestSha256,
        sha256: bundleSha256,
        issuedAt: '2026-08-29T00:00:00.000Z',
    };
}

const manifestSha = sha256Hex(canonicalJson(manifest));
const widgetEnvelope = signEnvelope(manifestSha, payloadSha);

// ---- Routed fetch mock.

interface SeenRequest {
    url: URL;
    headers: Record<string, string>;
}
const seen: SeenRequest[] = [];
type Routes = Record<string, () => Response>;
let routes: Routes = {};

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    );
    seen.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const handler = routes[url.pathname];
    if (!handler) return new Response('not found', { status: 404 });
    return handler();
}) as typeof fetch;
test.after(() => {
    globalThis.fetch = realFetch;
});

function json(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

const provider = createFreeblackmarketProvider();

const ENTITLEMENT = {
    id: 'ent-1',
    userId: 'user-1',
    providerId: 'freeblackmarket',
    providerListingId: 'listing-77',
    sku: null,
    kind: 'plugin',
    status: 'granted',
    grantedAt: '2026-08-29T00:00:00.000Z',
    expiresAt: null,
    sourceEventId: 'evt-1',
    metadata: {},
} as Parameters<NonNullable<typeof provider.issueSignedBundle>>[0];

function reset(overrides: Routes = {}): void {
    seen.length = 0;
    routes = {
        [`${PREFIX}/catalog/listings/listing-77`]: () =>
            json({ id: 'listing-77', slug: 'widget-listing', pluginSlug: SLUG }),
        [`/store/plugins/${SLUG}`]: () =>
            json({
                slug: SLUG,
                latest_version: {
                    version: '1.0.0',
                    code_sha256: null,
                    signed_bundle_url: `https://fbm.example.test/store/plugins/${SLUG}/manifest`,
                    signature_envelope: widgetEnvelope,
                    manifest_url: `https://fbm.example.test/store/plugins/${SLUG}/manifest`,
                },
            }),
        [`/store/plugins/${SLUG}/manifest`]: () => json(manifest),
        ...overrides,
    };
}

test('manifest_plugin bundle round-trips and verifies like the client would', async () => {
    reset();
    const bundle = await provider.issueSignedBundle!(ENTITLEMENT);

    // The manifest travels verbatim — its canonical hash must still match.
    assert.equal(sha256Hex(canonicalJson(bundle.manifest)), bundle.signature.manifestSha256);

    // The materialized bundle bytes hash to the signed bundle hash.
    const bundleBytes = Buffer.from(bundle.bundleBase64, 'base64');
    assert.equal(sha256Hex(bundleBytes), bundle.signature.sha256);
    assert.equal(bundle.signature.sha256, payloadSha, 'bundle is the declarative payload');

    // And the Ed25519 signature verifies over `${manifestSha}:${bundleSha}` —
    // the exact check the client's verifySignedBundle performs.
    const verified = crypto.verify(
        null,
        Buffer.from(`${bundle.signature.manifestSha256}:${bundle.signature.sha256}`, 'utf8'),
        publicKey,
        Buffer.from(bundle.signature.signature, 'base64')
    );
    assert.equal(verified, true);
});

test('registry reads carry the storefront publishable key, commerce reads the bearer key', async () => {
    reset();
    await provider.issueSignedBundle!(ENTITLEMENT);

    const commerce = seen.find((r) => r.url.pathname.startsWith(PREFIX));
    assert.ok(commerce, 'commerce catalog call happened');
    assert.equal(commerce!.headers['authorization'], 'Bearer fbm_test_key');

    const store = seen.filter((r) => r.url.pathname.startsWith('/store/plugins'));
    assert.ok(store.length >= 2, 'detail + manifest calls happened');
    for (const request of store) {
        assert.equal(request.headers['x-publishable-api-key'], 'pk_test_storefront');
        assert.equal(request.headers['authorization'], undefined, 'no bearer leak to /store');
    }
    // The manifest is pinned to the resolved version.
    const manifestCall = seen.find((r) => r.url.pathname === `/store/plugins/${SLUG}/manifest`);
    assert.equal(manifestCall!.url.searchParams.get('version'), '1.0.0');
});

test('code-blob plugins fetch the bundle bytes and enforce the signed hash', async () => {
    const blob = Buffer.from('real plugin code bytes', 'utf8');
    const blobSha = sha256Hex(blob);
    const codeManifest = { ...manifest, sha256: blobSha };
    const codeManifestSha = sha256Hex(canonicalJson(codeManifest));
    reset({
        [`/store/plugins/${SLUG}`]: () =>
            json({
                slug: SLUG,
                latest_version: {
                    version: '1.0.0',
                    code_sha256: blobSha,
                    signed_bundle_url: 'https://cdn.example.test/bundles/widget.tgz',
                    signature_envelope: signEnvelope(codeManifestSha, blobSha),
                },
            }),
        [`/store/plugins/${SLUG}/manifest`]: () => json(codeManifest),
        '/bundles/widget.tgz': () => new Response(blob, { status: 200 }),
    });
    const bundle = await provider.issueSignedBundle!(ENTITLEMENT);
    assert.equal(bundle.bundleBase64, blob.toString('base64'));
    assert.equal(bundle.signature.sha256, blobSha);
});

test('tampered code blobs are refused, not passed through', async () => {
    const blob = Buffer.from('real plugin code bytes', 'utf8');
    const blobSha = sha256Hex(blob);
    reset({
        [`/store/plugins/${SLUG}`]: () =>
            json({
                slug: SLUG,
                latest_version: {
                    version: '1.0.0',
                    code_sha256: blobSha,
                    signed_bundle_url: 'https://cdn.example.test/bundles/widget.tgz',
                    signature_envelope: signEnvelope(manifestSha, blobSha),
                },
            }),
        [`/store/plugins/${SLUG}/manifest`]: () => json(manifest),
        '/bundles/widget.tgz': () => new Response('tampered bytes!', { status: 200 }),
    });
    await assert.rejects(
        () => provider.issueSignedBundle!(ENTITLEMENT),
        /do not match the signed hash/
    );
});

test('plugins with no signed version fail with a clear reason', async () => {
    reset({
        [`/store/plugins/${SLUG}`]: () => json({ slug: SLUG, latest_version: null }),
    });
    await assert.rejects(() => provider.issueSignedBundle!(ENTITLEMENT), /no signed version/);
});

test('listings without registry identity fail with a clear reason', async () => {
    reset({
        [`${PREFIX}/catalog/listings/listing-77`]: () =>
            json({ id: 'listing-77', slug: null, pluginSlug: null }),
    });
    await assert.rejects(
        () => provider.issueSignedBundle!(ENTITLEMENT),
        /no plugin registry identity/
    );
});

test('missing publishable key fails closed with a config pointer', async () => {
    reset();
    const saved = process.env.FREEBLACKMARKET_PUBLISHABLE_KEY;
    delete process.env.FREEBLACKMARKET_PUBLISHABLE_KEY;
    try {
        const keyless = createFreeblackmarketProvider();
        await assert.rejects(
            () => keyless.issueSignedBundle!(ENTITLEMENT),
            /FREEBLACKMARKET_PUBLISHABLE_KEY/
        );
    } finally {
        process.env.FREEBLACKMARKET_PUBLISHABLE_KEY = saved;
    }
});
