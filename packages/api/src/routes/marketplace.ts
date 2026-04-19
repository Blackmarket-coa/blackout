import crypto from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import {
    feeForProvider,
    marketplaceProviderIds,
    type CatalogQuery,
    type MarketplaceCategory,
    type MarketplaceProviderId,
    type NormalizedListing,
} from '@blackout/core';
import type { AuthTokenPayload } from '../services/auth';
import {
    getMarketplaceProvider,
    getMarketplaceRegistry,
    listEnabledProviders,
} from '../integrations/marketplace';
import {
    getEntitlementById,
    getLicenseKey,
    listEntitlementsForUser,
} from '../services/marketplaceEntitlements';
import { dispatchMarketplaceWebhook } from '../services/marketplaceWebhook';

const marketplace = new Hono();

const LISTING_TTL_MS = 60_000;

type CachedListings = { at: number; listings: NormalizedListing[] };
const listingsCache = new Map<string, CachedListings>();

function cacheKey(providerId: MarketplaceProviderId, query: CatalogQuery): string {
    return `${providerId}|${query.category ?? ''}|${query.q ?? ''}|${query.cursor ?? ''}|${query.limit ?? ''}`;
}

function readQuery(c: Context): CatalogQuery {
    const params = c.req.query();
    const category = params['category'] as MarketplaceCategory | undefined;
    return {
        category,
        q: params['q'] ?? undefined,
        cursor: params['cursor'] ?? undefined,
        limit: params['limit'] ? Number.parseInt(params['limit'], 10) : undefined,
    };
}

function isProviderId(raw: string): raw is MarketplaceProviderId {
    return (marketplaceProviderIds as readonly string[]).includes(raw);
}

function requireUser(c: Context): AuthTokenPayload | null {
    const user = c.get('user') as AuthTokenPayload | null | undefined;
    return user ?? null;
}

marketplace.get('/providers', (c) => {
    const providers = [...getMarketplaceRegistry().values()].map((provider) => ({
        id: provider.id,
        displayName: provider.displayName,
        enabled: provider.enabled,
        capabilities: provider.capabilities,
        fees: feeForProvider(provider.id),
    }));
    return c.json({ providers });
});

marketplace.get('/listings', async (c) => {
    const providerIdRaw = c.req.query('providerId');
    const query = readQuery(c);

    const targets = providerIdRaw
        ? (isProviderId(providerIdRaw) ? [getMarketplaceProvider(providerIdRaw)] : []).filter(
              (provider): provider is NonNullable<typeof provider> => Boolean(provider?.enabled)
          )
        : listEnabledProviders();

    const results = await Promise.all(
        targets.map(async (provider) => {
            const key = cacheKey(provider.id, query);
            const cached = listingsCache.get(key);
            if (cached && Date.now() - cached.at < LISTING_TTL_MS) {
                return cached.listings;
            }
            try {
                const listings = await provider.fetchCatalog(query);
                listingsCache.set(key, { at: Date.now(), listings });
                return listings;
            } catch (error) {
                console.warn(`[marketplace] provider ${provider.id} catalog fetch failed`, error);
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

marketplace.post('/checkout', async (c) => {
    const user = requireUser(c);
    if (!user) {
        return c.json({ code: 'unauthorized', message: 'Sign in to purchase' }, 401);
    }
    const body = await c.req.json<{
        providerId?: string;
        listingId?: string;
        sku?: string;
        returnUrl?: string;
    }>();
    const { providerId, listingId, sku, returnUrl } = body;
    if (!providerId || !isProviderId(providerId)) {
        return c.json({ code: 'invalid_provider', message: 'Unknown provider id' }, 400);
    }
    if (!listingId) {
        return c.json({ code: 'listing_required', message: 'listingId is required' }, 400);
    }
    const provider = getMarketplaceProvider(providerId);
    if (!provider || !provider.enabled) {
        return c.json({ code: 'provider_disabled', message: 'Provider is disabled' }, 404);
    }

    const idempotencyKey = `${providerId}:${user.sub}:${listingId}:${crypto.randomUUID()}`;
    const result = await provider.createCheckoutSession({
        userId: user.sub,
        listingId,
        sku,
        idempotencyKey,
        returnUrl,
    });
    return c.json({
        redirectUrl: result.redirectUrl,
        sessionId: result.sessionId,
        providerId,
        listingId,
    });
});

marketplace.get('/entitlements', (c) => {
    const user = requireUser(c);
    if (!user) {
        return c.json({ code: 'unauthorized', message: 'Sign in to view entitlements' }, 401);
    }
    const entitlements = listEntitlementsForUser(user.sub);
    return c.json({ entitlements });
});

marketplace.get('/fulfillment/:entitlementId/asset', (c) => {
    const user = requireUser(c);
    if (!user) {
        return c.json({ code: 'unauthorized', message: 'Sign in to access fulfillment' }, 401);
    }
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
            response['licenseKey'] = key.key;
            response['activationsUsed'] = key.activationsUsed;
            response['activationsMax'] = key.activationsMax;
        }
    }

    return c.json(response);
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

export default marketplace;
