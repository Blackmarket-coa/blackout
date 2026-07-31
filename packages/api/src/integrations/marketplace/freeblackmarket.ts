import crypto from 'node:crypto';
import type {
    CatalogQuery,
    CheckoutInput,
    CheckoutResult,
    CreatorListingDraftInput,
    CreatorListingResult,
    CreatorOnboardingHandle,
    MarketplaceProvider,
    NormalizedLifecycleEvent,
    NormalizedListing,
    WebhookVerification,
} from '@blackout/core';
import { parseNormalizedLifecycleEvent, parseNormalizedListing } from '@blackout/core';

const PROVIDER_ID = 'freeblackmarket' as const;

// The §5 commerce API is served on FBM's Blackout integration surface, not at the
// bare work-order paths. The bare paths either 404 or collide with FBM's public
// storefront / seller-JWT routes (wrong auth). See the contract table in
// free-black-market/docs/contracts/blackout-integration.md (§5).
const COMMERCE_BASE = '/v1/integrations/blackout/commerce';

/**
 * Derive an FBM listing slug from a title. FBM's commerce/seller/listings route
 * requires a `slug` matching /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/ (3–64 chars);
 * the Blackout creator draft carries no slug, so synthesize a deterministic one.
 */
function slugifyTitle(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
        .replace(/-+$/g, '');
    return slug.length >= 3 ? slug : 'listing';
}

function envBool(key: string, fallback: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
    const raw = env[key];
    if (raw === undefined) return fallback;
    return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * Path prefix prepended to every commerce endpoint. Defaults to COMMERCE_BASE
 * (the only mount that works against a real FBM — see the comment above);
 * FREEBLACKMARKET_API_PREFIX overrides it if FBM ever moves the surface.
 * Configure the mount here, not as a path inside FREEBLACKMARKET_BASE_URL —
 * URL resolution discards any path component of the base URL.
 */
export function normalizeFreeblackmarketApiPrefix(raw?: string): string {
    const trimmed = raw?.trim();
    if (!trimmed) return COMMERCE_BASE;
    const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    // Collapse repeated leading slashes: a '//'-leading path would resolve as
    // a protocol-relative URL and send the bearer key to a different host.
    return withLeading.replace(/^\/+/, '/').replace(/\/+$/, '');
}

function buildCatalogPath(query: CatalogQuery, prefix: string): string {
    const params = new URLSearchParams();
    if (query.category) params.set('category', query.category);
    if (query.artifactKind) params.set('artifactKind', query.artifactKind);
    if (query.q) params.set('q', query.q);
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return qs ? `${prefix}/catalog/listings?${qs}` : `${prefix}/catalog/listings`;
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
        artifactKind: raw.artifactKind ?? raw.artifact_kind,
        tags: raw.tags,
        availableSkus: raw.availableSkus ?? raw.available_skus,
        featureKeys: raw.featureKeys ?? raw.feature_keys,
    });
}

export function assertFreeblackmarketSecretsForProduction(
    env: NodeJS.ProcessEnv = process.env
): void {
    if (env.NODE_ENV !== 'production') return;
    if (envBool('FREEBLACKMARKET_ENABLED', true, env) === false) return;
    const missing: string[] = [];
    if (!env.FREEBLACKMARKET_API_KEY) missing.push('FREEBLACKMARKET_API_KEY');
    if (!env.FREEBLACKMARKET_WEBHOOK_SECRET) missing.push('FREEBLACKMARKET_WEBHOOK_SECRET');
    if (missing.length > 0) {
        throw new Error(
            `[freeblackmarket] Refusing to start in production with missing secrets: ${missing.join(
                ', '
            )}. ` + `Set FREEBLACKMARKET_ENABLED=false to opt out, or supply both secrets.`
        );
    }
}

export function createFreeblackmarketProvider(): MarketplaceProvider {
    const baseUrl = process.env.FREEBLACKMARKET_BASE_URL ?? 'https://api.freeblackmarket.com';
    const apiPrefix = normalizeFreeblackmarketApiPrefix(process.env.FREEBLACKMARKET_API_PREFIX);
    const apiKey = process.env.FREEBLACKMARKET_API_KEY ?? '';
    const webhookSecret = process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? '';
    const enabled = envBool('FREEBLACKMARKET_ENABLED', true);
    assertFreeblackmarketSecretsForProduction();

    async function call<T>(path: string, init?: RequestInit): Promise<T> {
        // Refuse to egress when the provider is not configured. The read paths
        // (fetchCatalog/getListing) already early-return before reaching here;
        // this closes the mutating paths (checkout, creator-write, onboarding),
        // which previously called out to the production host with an empty
        // `authorization` header when no API key was set.
        if (!enabled || !apiKey) {
            throw new Error(
                `[freeblackmarket] refusing to call ${path}: provider not configured ` +
                    `(set FREEBLACKMARKET_API_KEY and FREEBLACKMARKET_ENABLED, or use the ` +
                    `stub via FREEBLACKMARKET_STUB=1)`
            );
        }
        const response = await fetch(new URL(path, baseUrl), {
            ...init,
            headers: {
                'content-type': 'application/json',
                authorization: apiKey ? `Bearer ${apiKey}` : '',
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
        capabilities: [
            'catalog',
            'search',
            'checkout',
            'webhooks',
            'payouts',
            'creator-sso',
            'creator-write',
            'embedded-checkout',
        ],

        async fetchCatalog(query: CatalogQuery): Promise<NormalizedListing[]> {
            if (!enabled || !apiKey) return [];
            const data = await call<{ listings: UpstreamListing[] }>(
                buildCatalogPath(query, apiPrefix)
            );
            return (
                data.listings
                    // Match the stub: never surface drafts / pending review / rejected /
                    // archived listings in the public catalog, even if the upstream API
                    // mistakenly returns them.
                    .filter((raw) => raw.status === undefined || raw.status === 'published')
                    .map(toNormalized)
                    // Apply the artifact-kind filter once we've normalized (the upstream
                    // call may not support it yet).
                    .filter(
                        (listing) =>
                            !query.artifactKind || listing.artifactKind === query.artifactKind
                    )
            );
        },

        async getListing(listingId: string): Promise<NormalizedListing | null> {
            if (!enabled || !apiKey) return null;
            try {
                const raw = await call<UpstreamListing>(
                    `${apiPrefix}/catalog/listings/${listingId}`
                );
                return toNormalized(raw);
            } catch {
                return null;
            }
        },

        async createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
            const path = input.embed
                ? `${apiPrefix}/checkout/sessions?embed=1`
                : `${apiPrefix}/checkout/sessions`;
            const raw = await call<{ url: string; id: string }>(path, {
                method: 'POST',
                headers: { 'idempotency-key': input.idempotencyKey },
                body: JSON.stringify({
                    userId: input.userId,
                    listingId: input.listingId,
                    sku: input.sku,
                    returnUrl: input.returnUrl,
                    embed: input.embed === true ? true : undefined,
                }),
            });
            return { redirectUrl: raw.url, sessionId: raw.id };
        },

        async createCreatorListing(input: CreatorListingDraftInput): Promise<CreatorListingResult> {
            // FBM's commerce/seller/listings route is strict: it requires a `slug`
            // and rejects the artifact-specific fields (artifactKind/artifactPayload/
            // artifactUploadId). Map the Blackout draft onto the catalog shape the
            // route accepts; artifact bytes are delivered via the signed-bundle
            // publish path, not this metadata call.
            const body = {
                sellerUserId: input.sellerUserId,
                slug: slugifyTitle(input.title),
                title: input.title,
                description: input.description,
                category: input.category,
                priceCents: input.priceCents,
                currency: input.currency,
                entitlementKind: input.entitlementKind,
                mediaUrls: input.mediaUrls,
                tags: input.tags,
            };
            const raw = await call<{
                id: string;
                slug?: string | null;
                status?: CreatorListingResult['status'];
            }>(`${apiPrefix}/seller/listings`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return {
                providerListingId: raw.id,
                publicSlug: raw.slug ?? null,
                status: raw.status ?? 'draft',
            };
        },

        async publishCreatorListing(providerListingId: string): Promise<CreatorListingResult> {
            const raw = await call<{
                id: string;
                slug?: string | null;
                status?: CreatorListingResult['status'];
            }>(`${apiPrefix}/seller/listings/${providerListingId}/publish`, {
                method: 'POST',
                body: JSON.stringify({}),
            });
            return {
                providerListingId: raw.id,
                publicSlug: raw.slug ?? null,
                status: raw.status ?? 'pending_review',
            };
        },

        async archiveCreatorListing(providerListingId: string): Promise<void> {
            await call<{ ok: boolean }>(`${apiPrefix}/seller/listings/${providerListingId}`, {
                method: 'DELETE',
            });
        },

        async startCreatorOnboarding(
            sellerUserId: string,
            returnUrl?: string
        ): Promise<CreatorOnboardingHandle> {
            const raw = await call<{ url: string; expiresAt: string }>(
                `${apiPrefix}/seller/onboarding`,
                {
                    method: 'POST',
                    body: JSON.stringify({ sellerUserId, returnUrl }),
                }
            );
            return { onboardingUrl: raw.url, expiresAt: raw.expiresAt };
        },

        verifyWebhook(
            rawBody: string,
            headers: Record<string, string | undefined>
        ): WebhookVerification {
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
            const ok = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
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
