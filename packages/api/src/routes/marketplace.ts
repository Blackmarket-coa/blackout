import crypto from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
    feeForProvider,
    getMarketplaceProviderPresentation,
    marketplaceProviderIds,
    type CatalogQuery,
    type MarketplaceCategory,
    type CreatorArtifactKind,
    type MarketplaceProviderId,
    type NormalizedListing,
} from '@blackout/core';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import {
    getMarketplaceProvider,
    getMarketplaceRegistry,
    listEnabledProviders,
} from '../integrations/marketplace';
import { getFreeblackmarketStubInternals } from '../integrations/marketplace/freeblackmarketStub';
import {
    getEntitlementById,
    getLicenseKey,
    listEntitlementsForUser,
} from '../services/marketplaceEntitlements';
import { dispatchMarketplaceWebhook } from '../services/marketplaceWebhook';
import { resolveVendorMxid } from '../services/fbmMatrixBridge/identity';
import { incrementCounter, logEvent } from '../services/marketplaceObservability';
import {
    addVersion,
    listReviews,
    listVersions,
    ratingSummary,
    upsertReview,
} from '../services/productReviews';
import { isValidProductRating } from '@blackout/core';
import { db } from '../db/store';
import type { MarketplaceProviderIdString } from '../db/types';

const marketplace = new Hono();

const LISTING_TTL_MS = 60_000;

function cacheKey(providerId: MarketplaceProviderId, query: CatalogQuery): string {
    return `${providerId}|${query.category ?? ''}|${query.artifactKind ?? ''}|${query.q ?? ''}|${query.cursor ?? ''}|${query.limit ?? ''}`;
}

function readQuery(c: Context): CatalogQuery {
    const params = c.req.query();
    const category = params['category'] as MarketplaceCategory | undefined;
    const artifactKind = params['artifactKind'] as CreatorArtifactKind | undefined;
    return {
        category,
        artifactKind,
        q: params['q'] ?? undefined,
        cursor: params['cursor'] ?? undefined,
        limit: params['limit'] ? Number.parseInt(params['limit'], 10) : undefined,
    };
}

function isProviderId(raw: string): raw is MarketplaceProviderId {
    return (marketplaceProviderIds as readonly string[]).includes(raw);
}

const checkoutSchema = z.object({
    providerId: z.string().min(1),
    listingId: z.string().min(1),
    sku: z.string().optional(),
    returnUrl: z.string().optional(),
    embed: z.boolean().optional(),
});

marketplace.get('/providers', (c) => {
    const providers = [...getMarketplaceRegistry().values()].map((provider) => {
        const presentation = getMarketplaceProviderPresentation(provider.id, provider.displayName);
        return {
            id: provider.id,
            displayName: provider.displayName,
            enabled: provider.enabled,
            capabilities: provider.capabilities,
            fees: feeForProvider(provider.id),
            presentation: {
                label: presentation.label,
                icon: presentation.icon,
                profileSlug: presentation.profileSlug,
                profileHeadline: presentation.profileHeadline,
            },
            trust: presentation.trust,
            profileUrl: `/marketplace/providers/${presentation.profileSlug}`,
        };
    });
    return c.json({ providers });
});

marketplace.get('/listings', async (c) => {
    const providerIdRaw = c.req.query('providerId');
    const query = readQuery(c);

    // Building the provider registry can throw (e.g. a provider factory that
    // requires missing config). Guard it so the endpoint degrades to an empty
    // catalog instead of a 500 that repeats on every request.
    let targets: ReturnType<typeof listEnabledProviders>;
    try {
        targets = providerIdRaw
            ? (isProviderId(providerIdRaw) ? [getMarketplaceProvider(providerIdRaw)] : []).filter(
                  (provider): provider is NonNullable<typeof provider> => Boolean(provider?.enabled)
              )
            : listEnabledProviders();
    } catch (error) {
        logEvent('marketplace.catalog.registry_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        incrementCounter('marketplace_catalog_fetch_failed_total', { providerId: 'registry' });
        return c.json({ listings: [], providerIds: [] });
    }

    const results = await Promise.all(
        targets.map(async (provider) => {
            const key = cacheKey(provider.id, query);
            // Wrap the whole per-provider body (including the cache read) so a
            // single provider's failure resolves to an empty list rather than
            // rejecting `Promise.all` and 500ing the endpoint.
            try {
                const cached = db.getMarketplaceListingsCache(key);
                const cachedAge = cached ? Date.now() - Date.parse(cached.refreshedAt) : Infinity;
                if (cached && cachedAge < LISTING_TTL_MS) {
                    return cached.listings as NormalizedListing[];
                }
                try {
                    const listings = await provider.fetchCatalog(query);
                    db.upsertMarketplaceListingsCache({
                        cacheKey: key,
                        providerId: provider.id as MarketplaceProviderIdString,
                        listings,
                        refreshedAt: new Date().toISOString(),
                    });
                    incrementCounter('marketplace_catalog_fetch_total', { providerId: provider.id });
                    return listings;
                } catch (error) {
                    logEvent('marketplace.catalog.fetch_failed', {
                        providerId: provider.id,
                        error: error instanceof Error ? error.message : String(error),
                        fellBackToStaleSnapshot: Boolean(cached),
                    });
                    incrementCounter('marketplace_catalog_fetch_failed_total', {
                        providerId: provider.id,
                    });
                    if (cached) {
                        return cached.listings as NormalizedListing[];
                    }
                    return [] as NormalizedListing[];
                }
            } catch (error) {
                logEvent('marketplace.catalog.provider_failed', {
                    providerId: provider.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                incrementCounter('marketplace_catalog_fetch_failed_total', {
                    providerId: provider.id,
                });
                return [] as NormalizedListing[];
            }
        })
    );

    const listings = results.flat();
    return c.json({ listings, providerIds: targets.map((provider) => provider.id) });
});

marketplace.get('/listings/:providerId/:listingId', async (c) => {
    const providerId = c.req.param('providerId');
    const listingId = c.req.param('listingId');
    if (!isProviderId(providerId)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    const provider = getMarketplaceProvider(providerId);
    if (!provider || !provider.enabled) {
        return c.json({ code: 'provider_disabled', message: 'Provider is disabled' }, 404);
    }
    const listing = await provider.getListing(listingId);
    if (!listing) {
        return c.json({ code: 'listing_not_found', message: 'Listing not found' }, 404);
    }
    return c.json({ listing });
});

// --- product pages: ratings, reviews, version history ---

marketplace.get('/listings/:providerId/:listingId/reviews', (c) => {
    const providerId = c.req.param('providerId');
    const listingId = c.req.param('listingId');
    if (!isProviderId(providerId)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    return c.json({
        reviews: listReviews(providerId, listingId),
        summary: ratingSummary(providerId, listingId),
    });
});

const reviewSchema = z.object({
    rating: z.number().int().min(1).max(5),
    body: z.string().max(4000).optional(),
});

marketplace.post('/listings/:providerId/:listingId/reviews', async (c) => {
    const user = requireUser(c, 'Sign in to review a product');
    if (user instanceof Response) return user;
    const providerId = c.req.param('providerId');
    const listingId = c.req.param('listingId');
    if (!isProviderId(providerId)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    const parsed = await readJsonBody(c, reviewSchema);
    if (parsed instanceof Response) return parsed;
    if (!isValidProductRating(parsed.rating)) {
        return c.json({ code: 'invalid_rating', message: 'Rating must be 1–5' }, 400);
    }
    const review = upsertReview({
        providerId,
        listingId,
        authorId: user.sub,
        rating: parsed.rating,
        body: parsed.body,
    });
    return c.json({ review, summary: ratingSummary(providerId, listingId) }, 201);
});

marketplace.get('/listings/:providerId/:listingId/versions', (c) => {
    const providerId = c.req.param('providerId');
    const listingId = c.req.param('listingId');
    if (!isProviderId(providerId)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    return c.json({ versions: listVersions(providerId, listingId) });
});

const versionSchema = z.object({
    version: z.string().min(1).max(64),
    notes: z.string().max(4000).optional(),
});

marketplace.post('/listings/:providerId/:listingId/versions', async (c) => {
    const user = requireUser(c, 'Sign in to publish a version');
    if (user instanceof Response) return user;
    const providerId = c.req.param('providerId');
    const listingId = c.req.param('listingId');
    if (!isProviderId(providerId)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    const parsed = await readJsonBody(c, versionSchema);
    if (parsed instanceof Response) return parsed;
    const version = addVersion({ providerId, listingId, version: parsed.version, notes: parsed.notes });
    return c.json({ version }, 201);
});

marketplace.post('/checkout', async (c) => {
    const user = requireUser(c, 'Sign in to purchase');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, checkoutSchema);
    if (parsed instanceof Response) return parsed;
    const { providerId, listingId, sku, returnUrl, embed } = parsed;
    if (!isProviderId(providerId)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    const provider = getMarketplaceProvider(providerId);
    if (!provider || !provider.enabled) {
        return c.json({ code: 'provider_disabled', message: 'Provider is disabled' }, 404);
    }

    const idempotencyKey = `${providerId}:${user.sub}:${listingId}:${crypto.randomUUID()}`;
    const wantsEmbed = embed === true && provider.capabilities.includes('embedded-checkout');
    const result = await provider.createCheckoutSession({
        userId: user.sub,
        listingId,
        sku,
        idempotencyKey,
        returnUrl,
        embed: wantsEmbed,
    });
    incrementCounter('marketplace_checkout_created_total', { providerId });
    logEvent('marketplace.checkout.created', {
        providerId,
        userId: user.sub,
        listingId,
        sku: sku ?? null,
        sessionId: result.sessionId,
        idempotencyKey,
    });
    return c.json({
        redirectUrl: result.redirectUrl,
        sessionId: result.sessionId,
        providerId,
        listingId,
        embed: wantsEmbed,
    });
});

marketplace.get('/entitlements', (c) => {
    const user = requireUser(c, 'Sign in to view entitlements');
    if (user instanceof Response) return user;
    const entitlements = listEntitlementsForUser(user.sub);
    return c.json({ entitlements });
});

// Resolve an opaque marketplace vendor id to a Matrix MXID so the client can
// open a direct message with the seller. The vendor↔MXID mapping otherwise
// lives only server-side (see fbmMatrixBridge/identity). Returns `mxid: null`
// when the vendor cannot be addressed, so the client hides the entrypoint
// rather than inviting a non-existent user.
marketplace.get('/vendors/:vendorId/matrix', (c) => {
    const user = requireUser(c, 'Sign in to contact vendors');
    if (user instanceof Response) return user;
    const vendorId = c.req.param('vendorId');
    return c.json({ vendorId, mxid: resolveVendorMxid(vendorId) });
});

marketplace.get('/fulfillment/:entitlementId/asset', (c) => {
    const user = requireUser(c, 'Sign in to access fulfillment');
    if (user instanceof Response) return user;
    const entitlement = getEntitlementById(c.req.param('entitlementId'));
    if (!entitlement || entitlement.userId !== user.sub) {
        return c.json({ code: 'entitlement_not_found', message: 'No such entitlement' }, 404);
    }
    if (entitlement.status !== 'granted') {
        return c.json(
            { code: 'entitlement_revoked', message: `Entitlement is ${entitlement.status}` },
            403
        );
    }

    const nonce = crypto.randomBytes(8).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1_000;
    const payload = `${entitlement.id}:${nonce}:${expiresAt}`;
    const signingSecret = process.env.MARKETPLACE_FULFILLMENT_SECRET ?? 'local-dev-fulfillment';
    const signature = crypto.createHmac('sha256', signingSecret).update(payload).digest('hex');
    const assetUrlTemplate = entitlement.metadata['assetUrl'];

    const response: Record<string, unknown> = {
        entitlementId: entitlement.id,
        providerId: entitlement.providerId,
        kind: entitlement.kind,
        signature,
        expiresAt: new Date(expiresAt).toISOString(),
    };

    if (typeof assetUrlTemplate === 'string') {
        const url = new URL(assetUrlTemplate);
        url.searchParams.set('nonce', nonce);
        url.searchParams.set('exp', String(expiresAt));
        url.searchParams.set('sig', signature);
        response['assetUrl'] = url.toString();
    }

    if (entitlement.kind === 'software_license') {
        const key = getLicenseKey(entitlement.id);
        if (key) {
            response['licenseKey'] = key.licenseKey;
            response['activationsUsed'] = key.activationsUsed;
            response['activationsMax'] = key.activationsMax;
        }
    }

    return c.json(response);
});

marketplace.get('/fulfillment/:entitlementId/bundle', async (c) => {
    const user = requireUser(c, 'Sign in to access fulfillment');
    if (user instanceof Response) return user;
    const entitlement = getEntitlementById(c.req.param('entitlementId'));
    if (!entitlement || entitlement.userId !== user.sub) {
        return c.json({ code: 'entitlement_not_found', message: 'No such entitlement' }, 404);
    }
    if (entitlement.status !== 'granted') {
        return c.json(
            { code: 'entitlement_revoked', message: `Entitlement is ${entitlement.status}` },
            403
        );
    }
    const provider = getMarketplaceProvider(entitlement.providerId);
    if (!provider?.issueSignedBundle) {
        return c.json(
            { code: 'bundle_unsupported', message: 'Provider does not deliver bundles directly' },
            400
        );
    }
    try {
        const bundle = await provider.issueSignedBundle(entitlement);
        return c.json(bundle);
    } catch (error) {
        return c.json(
            {
                code: 'bundle_failed',
                message: error instanceof Error ? error.message : String(error),
            },
            502
        );
    }
});

// Stub embed page: mounts a tiny HTML checkout that postMessages lifecycle
// events back to the parent and POSTs a signed webhook into this server's
// canonical webhook handler. Only mounted when the FBM stub provider is
// installed; otherwise it 404s.
marketplace.get('/stub/checkout/:sessionId', (c) => {
    const provider = getMarketplaceProvider('freeblackmarket');
    const internals = provider ? getFreeblackmarketStubInternals(provider) : undefined;
    if (!provider || !internals) {
        return c.json({ code: 'stub_disabled', message: 'FBM stub is not enabled' }, 404);
    }
    const sessionId = c.req.param('sessionId');
    const session = internals.getSession(sessionId);
    if (!session) {
        return c.json({ code: 'session_not_found', message: 'Unknown stub session' }, 404);
    }
    const sessionJson = JSON.stringify({ sessionId, listingId: session.listingId });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Stub checkout</title></head><body style="font-family: system-ui; padding: 24px;">
<h1>Stub checkout</h1>
<p>Session <code>${sessionId}</code> for listing <code>${session.listingId}</code>.</p>
<button id="complete">Complete purchase</button>
<button id="cancel">Cancel</button>
<script>
const session = ${sessionJson};
async function complete() {
    const res = await fetch('/v1/marketplace/stub/checkout/' + session.sessionId + '/complete', { method: 'POST' });
    if (!res.ok) {
        parent.postMessage({ type: 'checkout.error', sessionId: session.sessionId, reason: 'webhook-failed' }, '*');
        return;
    }
    parent.postMessage({ type: 'checkout.completed', sessionId: session.sessionId }, '*');
}
document.getElementById('complete').addEventListener('click', () => { complete(); });
document.getElementById('cancel').addEventListener('click', () => {
    parent.postMessage({ type: 'checkout.cancelled', sessionId: session.sessionId }, '*');
});
</script>
</body></html>`;
    return c.html(html);
});

marketplace.post('/stub/checkout/:sessionId/complete', async (c) => {
    const provider = getMarketplaceProvider('freeblackmarket');
    const internals = provider ? getFreeblackmarketStubInternals(provider) : undefined;
    if (!provider || !internals) {
        return c.json({ code: 'stub_disabled', message: 'FBM stub is not enabled' }, 404);
    }
    const sessionId = c.req.param('sessionId');
    const materialized = internals.materializeWebhook(sessionId);
    if (!materialized) {
        return c.json({ code: 'session_not_found', message: 'Unknown stub session' }, 404);
    }
    const result = await dispatchMarketplaceWebhook(provider, materialized.body, {
        'x-fbm-event-id': materialized.eventId,
        'x-fbm-signature': materialized.signature,
    });
    return c.json(
        {
            ok: result.ok,
            entitlementId: result.applied?.entitlement?.id,
            eventId: materialized.eventId,
        },
        result.status === 200 ? 200 : 502
    );
});

// Stub-only driver for FBM → Matrix bridge events (order.*, inventory.*,
// ledger.*, subscription.*, dispute.*). The `:kind` path segment is the event
// `type`; the JSON body carries the event fields. Synthesizes a signed webhook
// and runs it through the canonical dispatcher, so the whole bridge can be
// exercised end-to-end locally without a live FBM. 404s when the stub is off.
marketplace.post('/stub/fbm-event/:kind', async (c) => {
    const provider = getMarketplaceProvider('freeblackmarket');
    const internals = provider ? getFreeblackmarketStubInternals(provider) : undefined;
    if (!provider || !internals) {
        return c.json({ code: 'stub_disabled', message: 'FBM stub is not enabled' }, 404);
    }
    const kind = c.req.param('kind');
    let params: Record<string, unknown> = {};
    try {
        const raw = await c.req.text();
        params = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
        return c.json({ code: 'invalid_json', message: 'Body must be JSON' }, 400);
    }
    const materialized = internals.materializeEvent({ ...params, type: kind });
    const result = await dispatchMarketplaceWebhook(provider, materialized.body, {
        'x-fbm-event-id': materialized.eventId,
        'x-fbm-signature': materialized.signature,
    });
    return c.json(
        { ok: result.ok, eventId: materialized.eventId, alreadyProcessed: result.applied?.alreadyProcessed ?? false },
        result.status === 200 ? 200 : (result.status as 400 | 401 | 404 | 502)
    );
});

marketplace.post('/webhooks/:providerId', async (c) => {
    const providerIdRaw = c.req.param('providerId');
    if (!isProviderId(providerIdRaw)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    const provider = getMarketplaceProvider(providerIdRaw);
    if (!provider) {
        return c.json({ code: 'provider_not_found', message: 'Provider not registered' }, 404);
    }
    const rawBody = await c.req.text();
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(c.req.header())) {
        headers[key.toLowerCase()] = value;
    }
    const result = await dispatchMarketplaceWebhook(provider, rawBody, headers);
    const body = {
        ok: result.ok,
        reason: result.reason,
        eventType: result.event?.type,
        entitlementId: result.applied?.entitlement?.id,
        alreadyProcessed: result.applied?.alreadyProcessed ?? false,
    };
    if (result.status === 401) return c.json(body, 401);
    if (result.status === 400) return c.json(body, 400);
    if (result.status === 404) return c.json(body, 404);
    return c.json(body, 200);
});

// --- producer profiles (seller display cards) -----------------------------
//
// Display-only read-view over marketplace_seller_profiles. The public GET omits
// payoutId (private payout routing); the authed PUT lets a producer edit their
// own display fields. reputationTier is server/FBM-derived and is preserved
// across edits rather than client-settable.

interface PublicProducerProfile {
    userId: string;
    providerId: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    reputationTier: string | null;
    vacationMode: boolean;
    updatedAt: string;
}

function toPublicProfile(record: {
    userId: string;
    providerId: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    reputationTier: string | null;
    vacationMode: boolean;
    updatedAt: string;
}): PublicProducerProfile {
    return {
        userId: record.userId,
        providerId: record.providerId,
        displayName: record.displayName,
        bio: record.bio,
        avatarUrl: record.avatarUrl,
        reputationTier: record.reputationTier,
        vacationMode: record.vacationMode,
        updatedAt: record.updatedAt,
    };
}

marketplace.get('/sellers/:userId/profile', (c) => {
    const userId = c.req.param('userId');
    const providerId = c.req.query('providerId') ?? 'freeblackmarket';
    if (!isProviderId(providerId)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    const record = db.getSellerProfile(userId, providerId);
    if (!record) {
        return c.json({ code: 'not_found', message: 'No producer profile' }, 404);
    }
    return c.json({ profile: toPublicProfile(record) });
});

const producerProfileSchema = z.object({
    providerId: z.string().min(1).max(64).optional(),
    displayName: z.string().max(120).nullish(),
    bio: z.string().max(2000).nullish(),
    avatarUrl: z.string().url().max(2048).nullish(),
    vacationMode: z.boolean().optional(),
});

marketplace.put('/sellers/me/profile', async (c) => {
    const user = requireUser(c, 'Sign in to edit your producer profile');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, producerProfileSchema);
    if (parsed instanceof Response) return parsed;
    const providerId = parsed.providerId ?? 'freeblackmarket';
    if (!isProviderId(providerId)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    const existing = db.getSellerProfile(user.sub, providerId);
    const profile = db.upsertSellerProfile({
        userId: user.sub,
        providerId,
        displayName: parsed.displayName ?? existing?.displayName ?? null,
        bio: parsed.bio ?? existing?.bio ?? null,
        avatarUrl: parsed.avatarUrl ?? existing?.avatarUrl ?? null,
        // payoutId / reputationTier are not client-settable — preserve existing.
        payoutId: existing?.payoutId ?? null,
        reputationTier: existing?.reputationTier ?? null,
        vacationMode: parsed.vacationMode ?? existing?.vacationMode ?? false,
    });
    return c.json({ profile: toPublicProfile(profile) }, existing ? 200 : 201);
});

export default marketplace;
