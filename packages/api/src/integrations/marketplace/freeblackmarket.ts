import crypto from 'node:crypto';
import type {
    CatalogQuery,
    CheckoutInput,
    CheckoutResult,
    CreatorListingDraftInput,
    CreatorListingResult,
    CreatorOnboardingHandle,
    MarketplaceProvider,
    NormalizedEntitlement,
    NormalizedLifecycleEvent,
    NormalizedListing,
    SignedPluginBundleEnvelope,
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

/**
 * Canonical JSON — recursively key-sorted, no whitespace. Byte-identical to
 * FBM's `marketplace-signing` serializer and the blackout client verifier
 * (`pluginSignature.ts#canonicalJson`); the signed-bundle hashes only line up
 * because all three produce the same bytes.
 */
function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

function sha256Hex(bytes: Uint8Array | string): string {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** `latest_version` row from FBM's public `GET /store/plugins/:slug` detail. */
interface PluginVersionView {
    version: string;
    code_sha256?: string | null;
    signed_bundle_url?: string | null;
    signature_envelope?: Record<string, unknown> | null;
    manifest_url?: string | null;
}

/**
 * Parse FBM's stored distribution envelope. It is minted in the Blackout wire
 * format (`{keyId, signature, manifestSha256, sha256, issuedAt}`, Ed25519 over
 * `${manifestSha256}:${sha256}`) by construction — no translation, only shape
 * validation. See free-black-market/docs/contracts/extension-manifest.md.
 */
function parseSignatureEnvelope(
    raw: Record<string, unknown>
): SignedPluginBundleEnvelope['signature'] {
    const fields = ['keyId', 'signature', 'manifestSha256', 'sha256', 'issuedAt'] as const;
    for (const field of fields) {
        if (typeof raw[field] !== 'string' || (raw[field] as string).length === 0) {
            throw new Error(`signature envelope is missing '${field}'`);
        }
    }
    return {
        keyId: raw.keyId as string,
        signature: raw.signature as string,
        manifestSha256: raw.manifestSha256 as string,
        sha256: raw.sha256 as string,
        issuedAt: raw.issuedAt as string,
    };
}

/**
 * Candidate byte-materializations for a blob-less bundle, in contract order:
 * the declarative payload (`{homepageCard?, dataSource?}` — a `manifest_plugin`'s
 * signed "bundle", per extension-manifest.md) first, then the whole canonical
 * manifest (the registry's hash fallback for sha256-less manifests).
 */
function declarativeBundleCandidates(manifest: Record<string, unknown>): string[] {
    const payload: Record<string, unknown> = {};
    if (manifest.homepageCard !== undefined) payload.homepageCard = manifest.homepageCard;
    const fbm = manifest.fbm;
    if (fbm && typeof fbm === 'object' && !Array.isArray(fbm)) {
        const dataSource = (fbm as Record<string, unknown>).dataSource;
        if (dataSource !== undefined) payload.dataSource = dataSource;
    }
    return [canonicalJson(payload), canonicalJson(manifest)];
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
    // Medusa gates every /store/* route behind a (public-by-design) storefront
    // publishable key; FBM's plugin registry read side lives there. Optional —
    // only the signed-bundle path needs it, and it fails closed with a
    // config pointer when unset.
    const publishableKey = process.env.FREEBLACKMARKET_PUBLISHABLE_KEY ?? '';
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

    /**
     * GET against FBM's public /store surface (plugin registry reads).
     * Authenticated by the storefront publishable key, not the commerce
     * bearer key — Medusa rejects /store requests without one.
     */
    async function storeGet<T>(path: string): Promise<T> {
        if (!enabled || !publishableKey) {
            throw new Error(
                `[freeblackmarket] refusing to call ${path}: registry reads need ` +
                    `FREEBLACKMARKET_PUBLISHABLE_KEY (the FBM storefront publishable key)`
            );
        }
        const response = await fetch(new URL(path, baseUrl), {
            headers: {
                'content-type': 'application/json',
                'x-publishable-api-key': publishableKey,
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
                    embedOrigin: input.embed === true ? input.embedOrigin : undefined,
                    // Bounded echo FBM copies onto the order and returns on
                    // purchase.succeeded — the return-leg correlation channel.
                    metadata:
                        input.metadata && Object.keys(input.metadata).length > 0
                            ? input.metadata
                            : undefined,
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

        /**
         * Real signed-bundle delivery (W3): resolve the entitled commerce
         * listing to its plugin-registry identity, then assemble the
         * `SignedPluginBundle` the client verifier already checks from FBM's
         * public detail + manifest routes. The stored envelope is already in
         * the Blackout wire format (minted at publish under FBM's Ed25519
         * platform key), and the manifest is passed through verbatim — any
         * re-serialization here would break `manifestSha256`.
         */
        async issueSignedBundle(
            entitlement: NormalizedEntitlement
        ): Promise<SignedPluginBundleEnvelope> {
            // 1. Commerce listing → registry slug. `pluginSlug` is stamped by
            //    FBM's publish bridge; fall back to the listing slug (they
            //    coincide unless the author chose a distinct registry slug).
            const listing = await call<{ slug?: string | null; pluginSlug?: string | null }>(
                `${apiPrefix}/catalog/listings/${entitlement.providerListingId}`
            );
            const slug = listing.pluginSlug ?? listing.slug;
            if (!slug) {
                throw new Error(
                    `listing ${entitlement.providerListingId} has no plugin registry identity`
                );
            }

            // 2. Latest resolvable version + its distribution envelope.
            const detail = await storeGet<{ latest_version?: PluginVersionView | null }>(
                `/store/plugins/${encodeURIComponent(slug)}`
            );
            const latest = detail.latest_version;
            if (!latest?.signature_envelope) {
                throw new Error(`plugin '${slug}' has no signed version to deliver`);
            }
            const signature = parseSignatureEnvelope(latest.signature_envelope);

            // 3. The canonical distribution manifest for that exact version.
            const manifest = await storeGet<Record<string, unknown>>(
                `/store/plugins/${encodeURIComponent(slug)}/manifest?version=${encodeURIComponent(
                    latest.version
                )}`
            );

            // 4. Bundle bytes. A recorded code hash means a real blob: fetch
            //    it and refuse on hash mismatch. Blob-less plugins
            //    (manifest_plugin) reconstruct the signed declarative payload.
            let bundleBytes: Buffer | null = null;
            if (latest.code_sha256) {
                if (!latest.signed_bundle_url) {
                    throw new Error(`plugin '${slug}' has a code hash but no bundle URL`);
                }
                const response = await fetch(new URL(latest.signed_bundle_url, baseUrl));
                if (!response.ok) {
                    throw new Error(`bundle fetch for '${slug}' failed: ${response.status}`);
                }
                bundleBytes = Buffer.from(await response.arrayBuffer());
                if (sha256Hex(bundleBytes) !== signature.sha256) {
                    throw new Error(`bundle bytes for '${slug}' do not match the signed hash`);
                }
            } else {
                for (const candidate of declarativeBundleCandidates(manifest)) {
                    if (sha256Hex(candidate) === signature.sha256) {
                        bundleBytes = Buffer.from(candidate, 'utf8');
                        break;
                    }
                }
                if (!bundleBytes) {
                    throw new Error(
                        `could not materialize bundle bytes matching the signed hash for '${slug}'`
                    );
                }
            }

            return {
                manifest,
                bundleBase64: bundleBytes.toString('base64'),
                signature,
            };
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
