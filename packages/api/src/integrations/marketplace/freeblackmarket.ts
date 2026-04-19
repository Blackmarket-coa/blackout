import crypto from 'node:crypto';
import type {
    CatalogQuery,
    CheckoutInput,
    CheckoutResult,
    MarketplaceProvider,
    NormalizedLifecycleEvent,
    NormalizedListing,
    WebhookVerification,
} from '@blackout/core';
import { parseNormalizedLifecycleEvent, parseNormalizedListing } from '@blackout/core';

const PROVIDER_ID = 'freeblackmarket' as const;

function envBool(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    if (raw === undefined) return fallback;
    return raw === '1' || raw.toLowerCase() === 'true';
}

function buildCatalogUrl(base: string, query: CatalogQuery): string {
    const url = new URL('/v1/catalog/listings', base);
    if (query.category) url.searchParams.set('category', query.category);
    if (query.q) url.searchParams.set('q', query.q);
    if (query.cursor) url.searchParams.set('cursor', query.cursor);
    if (query.limit) url.searchParams.set('limit', String(query.limit));
    return url.toString();
}

interface UpstreamListing {
    id: string;
    [key: string]: unknown;
}

function toNormalized(raw: UpstreamListing): NormalizedListing {
    return parseNormalizedListing({
        providerId: PROVIDER_ID,
        providerListingId: raw.id,
        category: raw.category,
        title: raw.title,
        description: raw.description,
        priceCents: raw.priceCents ?? raw.price_cents,
        currency: raw.currency,
        sellerId: raw.sellerId ?? raw.seller_id ?? null,
        sellerDisplayName: raw.sellerDisplayName ?? raw.seller_display_name,
        mediaUrls: raw.mediaUrls ?? raw.media_urls ?? [],
        entitlementKind: raw.entitlementKind ?? raw.entitlement_kind,
        tags: raw.tags,
        availableSkus: raw.availableSkus ?? raw.available_skus,
    });
}

export function createFreeblackmarketProvider(): MarketplaceProvider {
    const baseUrl = process.env.FREEBLACKMARKET_BASE_URL ?? 'https://api.freeblackmarket.com';
    const apiKey = process.env.FREEBLACKMARKET_API_KEY ?? '';
    const webhookSecret = process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? '';
    const enabled = envBool('FREEBLACKMARKET_ENABLED', true);

    async function call<T>(path: string, init?: RequestInit): Promise<T> {
        const response = await fetch(new URL(path, baseUrl), {
            ...init,
            headers: {
                'content-type': 'application/json',
                'authorization': apiKey ? `Bearer ${apiKey}` : '',
                ...(init?.headers ?? {}),
            },
        });
        if (!response.ok) {
            throw new Error(`freeblackmarket ${path} failed: ${response.status}`);
        }
        return (await response.json()) as T;
    }

    return {
        id: PROVIDER_ID,
        displayName: 'Free Black Market',
        baseUrl,
        enabled,
        auth: 'api-key',
        capabilities: ['catalog', 'search', 'checkout', 'webhooks', 'payouts', 'creator-sso'],

        async fetchCatalog(query: CatalogQuery): Promise<NormalizedListing[]> {
            if (!enabled || !apiKey) return [];
            const data = await call<{ listings: UpstreamListing[] }>(
                buildCatalogUrl(baseUrl, query).replace(baseUrl, '')
            );
            return data.listings.map(toNormalized);
        },

        async getListing(listingId: string): Promise<NormalizedListing | null> {
            if (!enabled || !apiKey) return null;
            try {
                const raw = await call<UpstreamListing>(`/v1/catalog/listings/${listingId}`);
                return toNormalized(raw);
            } catch {
                return null;
            }
        },

        async createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
            const raw = await call<{ url: string; id: string }>('/v1/checkout/sessions', {
                method: 'POST',
                headers: { 'idempotency-key': input.idempotencyKey },
                body: JSON.stringify({
                    userId: input.userId,
                    listingId: input.listingId,
                    sku: input.sku,
                    returnUrl: input.returnUrl,
                }),
            });
            return { redirectUrl: raw.url, sessionId: raw.id };
        },

        verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookVerification {
            const signature = headers['x-fbm-signature'];
            const eventId = headers['x-fbm-event-id'] ?? null;
            if (!webhookSecret) return { ok: false, eventId, reason: 'webhook-secret-missing' };
            if (!signature) return { ok: false, eventId, reason: 'signature-missing' };
            const expected = crypto
                .createHmac('sha256', webhookSecret)
                .update(rawBody)
                .digest('hex');
            const sigBuf = Buffer.from(signature, 'hex');
            const expBuf = Buffer.from(expected, 'hex');
            const ok =
                sigBuf.length === expBuf.length &&
                crypto.timingSafeEqual(sigBuf, expBuf);
            return { ok, eventId, reason: ok ? undefined : 'signature-mismatch' };
        },

        parseEvent(payload: unknown): NormalizedLifecycleEvent | null {
            try {
                return parseNormalizedLifecycleEvent({
                    ...(payload as Record<string, unknown>),
                    providerId: PROVIDER_ID,
                });
            } catch {
                return null;
            }
        },
    };
}
