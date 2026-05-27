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
import { parseNormalizedLifecycleEvent } from '@blackout/core';

const PROVIDER_ID = 'freeblackmarket' as const;
const STUB_KEY_ID = 'fbm-dev-hmac';
const DEFAULT_DEV_HMAC_HEX = '6465762d68616d63'; // ascii "dev-hamc"

interface StubListing {
    listing: NormalizedListing;
    sellerUserId: string | null;
    artifactKind: CreatorListingDraftInput['artifactKind'];
    artifactPayload: unknown;
    publicSlug: string;
    status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';
    createdAt: string;
}

interface StubSession {
    sessionId: string;
    userId: string;
    listingId: string;
    sku: string | null;
    embed: boolean;
    createdAt: string;
}

const SEEDED_LISTINGS: StubListing[] = [
    {
        listing: {
            providerId: PROVIDER_ID,
            providerListingId: 'stub-theme-noir',
            category: 'plugin-curated',
            title: 'Noir Theme',
            description: 'A demo dark theme bundled for end-to-end testing.',
            priceCents: 0,
            currency: 'USD',
            sellerId: 'stub-seller',
            sellerDisplayName: 'Stub Seller',
            mediaUrls: [],
            entitlementKind: 'plugin_flag',
            tags: ['theme', 'demo'],
        },
        sellerUserId: null,
        artifactKind: 'theme',
        artifactPayload: { palette: { background: '#0a0a0a', accent: '#9d8df1' } },
        publicSlug: 'noir-theme',
        status: 'published',
        createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
        listing: {
            providerId: PROVIDER_ID,
            providerListingId: 'stub-stickers-cats',
            category: 'emoji-sticker',
            title: 'Cat Sticker Pack',
            description: '12 demo stickers for testing the asset_bundle install path.',
            priceCents: 199,
            currency: 'USD',
            sellerId: 'stub-seller',
            sellerDisplayName: 'Stub Seller',
            mediaUrls: [],
            entitlementKind: 'asset_bundle',
            tags: ['sticker', 'demo'],
        },
        sellerUserId: null,
        artifactKind: 'asset_bundle',
        artifactPayload: { files: [{ name: 'cat.png', mime: 'image/png', base64: '' }] },
        publicSlug: 'cat-sticker-pack',
        status: 'published',
        createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
        listing: {
            providerId: PROVIDER_ID,
            providerListingId: 'stub-plugin-todo',
            category: 'plugin-curated',
            title: 'Todo Manifest Plugin',
            description:
                'Demo manifest plugin (no JS). Exercises the plugin_flag → registry path.',
            priceCents: 99,
            currency: 'USD',
            sellerId: 'stub-seller',
            sellerDisplayName: 'Stub Seller',
            mediaUrls: [],
            entitlementKind: 'plugin_flag',
            tags: ['plugin', 'demo'],
        },
        sellerUserId: null,
        artifactKind: 'manifest_plugin',
        artifactPayload: {
            id: 'stub.todo',
            name: 'Todo',
            category: 'workflow plugin',
        },
        publicSlug: 'todo-manifest-plugin',
        status: 'published',
        createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
        listing: {
            providerId: PROVIDER_ID,
            providerListingId: 'stub-cosmetic-aurora-ring',
            category: 'profile-cosmetic',
            title: 'Aurora Avatar Ring',
            description: 'Animated avatar decoration ring. Exercises the profile_cosmetic path.',
            priceCents: 299,
            currency: 'USD',
            sellerId: 'stub-seller',
            sellerDisplayName: 'Stub Seller',
            mediaUrls: [],
            entitlementKind: 'profile_cosmetic',
            tags: ['cosmetic', 'avatar', 'demo'],
        },
        sellerUserId: null,
        artifactKind: 'profile_cosmetic',
        artifactPayload: {
            cosmeticType: 'avatar_decoration',
            id: 'ring-aurora-01',
            gradient: ['#7af0ff', '#9d8df1'],
        },
        publicSlug: 'aurora-avatar-ring',
        status: 'published',
        createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
        listing: {
            providerId: PROVIDER_ID,
            providerListingId: 'stub-sound-airhorn',
            category: 'audio-pack',
            title: 'Airhorn Soundboard Pack',
            description: '6 demo soundboard clips. Exercises the sound_pack path.',
            priceCents: 149,
            currency: 'USD',
            sellerId: 'stub-seller',
            sellerDisplayName: 'Stub Seller',
            mediaUrls: [],
            entitlementKind: 'sound_pack',
            tags: ['audio', 'soundboard', 'demo'],
        },
        sellerUserId: null,
        artifactKind: 'sound_pack',
        artifactPayload: {
            soundKind: 'soundboard',
            packId: 'airhorn-01',
            clips: [{ id: 'airhorn', name: 'Airhorn' }],
        },
        publicSlug: 'airhorn-soundboard-pack',
        status: 'published',
        createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
        listing: {
            providerId: PROVIDER_ID,
            providerListingId: 'stub-template-study-hall',
            category: 'community-template',
            title: 'Study Hall Community Template',
            description: 'Den layout + roles + mod rules. Exercises the community_template path.',
            priceCents: 0,
            currency: 'USD',
            sellerId: 'stub-seller',
            sellerDisplayName: 'Stub Seller',
            mediaUrls: [],
            entitlementKind: 'community_template',
            tags: ['template', 'community', 'demo'],
        },
        sellerUserId: null,
        artifactKind: 'community_template',
        artifactPayload: {
            template: { dens: ['lobby', 'study'], roles: ['mentor', 'student'] },
        },
        publicSlug: 'study-hall-community-template',
        status: 'published',
        createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
        listing: {
            providerId: PROVIDER_ID,
            providerListingId: 'stub-stream-neon-overlay',
            category: 'creator-asset',
            title: 'Neon Stream Overlay Pack',
            description: 'Overlay + alert pack. Exercises the stream_asset path.',
            priceCents: 499,
            currency: 'USD',
            sellerId: 'stub-seller',
            sellerDisplayName: 'Stub Seller',
            mediaUrls: [],
            entitlementKind: 'stream_asset',
            tags: ['stream', 'overlay', 'demo'],
        },
        sellerUserId: null,
        artifactKind: 'stream_asset',
        artifactPayload: { assetType: 'overlay', scenes: ['starting-soon', 'live'] },
        publicSlug: 'neon-stream-overlay-pack',
        status: 'published',
        createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
        listing: {
            providerId: PROVIDER_ID,
            providerListingId: 'stub-security-metascrub',
            category: 'security-tool',
            title: 'Metadata Scrubber',
            description: 'Sandboxed privacy tool that strips EXIF/metadata before sharing.',
            priceCents: 0,
            currency: 'USD',
            sellerId: 'stub-seller',
            sellerDisplayName: 'Stub Seller',
            mediaUrls: [],
            entitlementKind: 'software_license',
            tags: ['security', 'privacy', 'demo'],
        },
        sellerUserId: null,
        artifactKind: 'code_plugin',
        artifactPayload: { manifest: { id: 'stub.metascrub' }, bundleBase64: '', sha256: '' },
        publicSlug: 'metadata-scrubber',
        status: 'published',
        createdAt: '2026-05-01T00:00:00.000Z',
    },
    {
        listing: {
            providerId: PROVIDER_ID,
            providerListingId: 'stub-ai-mentor-persona',
            category: 'ai-automation',
            title: 'Study Mentor AI Persona',
            description: 'AI persona confined to AI dens. Exercises the ai_persona path.',
            priceCents: 199,
            currency: 'USD',
            sellerId: 'stub-seller',
            sellerDisplayName: 'Stub Seller',
            mediaUrls: [],
            entitlementKind: 'plugin_flag',
            tags: ['ai', 'persona', 'demo'],
        },
        sellerUserId: null,
        artifactKind: 'ai_persona',
        artifactPayload: { persona: { name: 'Mentor', systemPrompt: 'You are a patient tutor.' } },
        publicSlug: 'study-mentor-ai-persona',
        status: 'published',
        createdAt: '2026-05-01T00:00:00.000Z',
    },
];

function envBool(key: string, fallback: boolean, env = process.env): boolean {
    const raw = env[key];
    if (raw === undefined) return fallback;
    return raw === '1' || raw.toLowerCase() === 'true';
}

function nowIso(): string {
    return new Date().toISOString();
}

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
        .join(',')}}`;
}

function sha256Hex(bytes: Uint8Array | string): string {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function hmacHex(secretHex: string, message: string | Uint8Array): string {
    const key = Buffer.from(secretHex, 'hex');
    return crypto.createHmac('sha256', key).update(message).digest('hex');
}

function getDevHmacHex(env = process.env): string {
    return env.BLACKOUT_PLUGIN_DEV_HMAC ?? DEFAULT_DEV_HMAC_HEX;
}

export interface FreeblackmarketStubInternals {
    /** Look up a session by its id (used by the stub embed page). */
    getSession(sessionId: string): StubSession | undefined;
    /**
     * Synthesize a webhook body + HMAC signature for a given session.
     * Used by the stub embed action to drive the canonical webhook flow.
     */
    materializeWebhook(sessionId: string): { body: string; signature: string; eventId: string } | null;
    /** Test-only: clear in-memory state. */
    reset(): void;
}

const stubInternalsByInstance = new WeakMap<MarketplaceProvider, FreeblackmarketStubInternals>();

export function getFreeblackmarketStubInternals(
    provider: MarketplaceProvider
): FreeblackmarketStubInternals | undefined {
    return stubInternalsByInstance.get(provider);
}

export function shouldUseFreeblackmarketStub(env = process.env): boolean {
    return envBool('FREEBLACKMARKET_STUB', false, env);
}

export function createFreeblackmarketStubProvider(): MarketplaceProvider {
    const baseUrl = process.env.FREEBLACKMARKET_BASE_URL ?? 'https://stub.freeblackmarket.local';
    const webhookSecret = process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? 'stub-webhook-secret';
    const apiBaseUrl =
        process.env.BLACKOUT_PUBLIC_API_BASE_URL ?? process.env.PUBLIC_API_BASE_URL ?? '';
    const enabled = envBool('FREEBLACKMARKET_ENABLED', true);

    const listings = new Map<string, StubListing>();
    for (const seed of SEEDED_LISTINGS) listings.set(seed.listing.providerListingId, { ...seed });

    const sessions = new Map<string, StubSession>();

    function listFor(query: CatalogQuery): NormalizedListing[] {
        const all = [...listings.values()].filter((l) => l.status === 'published');
        return all
            .filter((entry) => !query.category || entry.listing.category === query.category)
            .filter((entry) => {
                if (!query.q) return true;
                const needle = query.q.toLowerCase();
                return (
                    entry.listing.title.toLowerCase().includes(needle) ||
                    entry.listing.description.toLowerCase().includes(needle)
                );
            })
            .map((entry) => entry.listing);
    }

    function buildEmbedUrl(sessionId: string, embed: boolean): string {
        const path = `/v1/marketplace/stub/checkout/${sessionId}${embed ? '?embed=1' : ''}`;
        if (apiBaseUrl) return new URL(path, apiBaseUrl).toString();
        // Relative URL — caller resolves against the current origin.
        return path;
    }

    function buildSignedBundle(entry: StubListing): SignedPluginBundleEnvelope {
        const manifest = {
            id: `stub.${entry.listing.providerListingId}`,
            name: entry.listing.title,
            version: '1.0.0',
            artifactKind: entry.artifactKind,
            listing: {
                providerId: PROVIDER_ID,
                providerListingId: entry.listing.providerListingId,
                publicSlug: entry.publicSlug,
            },
            capabilities: [] as string[],
            sha256: '',
            description: entry.listing.description,
        };

        const bundleBytes = Buffer.from(
            JSON.stringify({
                kind: entry.artifactKind,
                payload: entry.artifactPayload,
            }),
            'utf8'
        );
        const bundleSha = sha256Hex(bundleBytes);
        manifest.sha256 = bundleSha;
        const manifestSha = sha256Hex(canonicalJson(manifest));
        const devKey = getDevHmacHex();
        const signature = hmacHex(devKey, `${manifestSha}:${bundleSha}`);

        return {
            manifest,
            bundleBase64: bundleBytes.toString('base64'),
            signature: {
                keyId: STUB_KEY_ID,
                signature,
                manifestSha256: manifestSha,
                sha256: bundleSha,
                issuedAt: nowIso(),
            },
        };
    }

    const provider: MarketplaceProvider = {
        id: PROVIDER_ID,
        displayName: 'Free Black Market (stub)',
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
            return listFor(query);
        },

        async getListing(listingId: string): Promise<NormalizedListing | null> {
            return listings.get(listingId)?.listing ?? null;
        },

        async createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
            if (!listings.has(input.listingId)) {
                throw new Error(`stub: unknown listing ${input.listingId}`);
            }
            const sessionId = crypto.randomUUID();
            sessions.set(sessionId, {
                sessionId,
                userId: input.userId,
                listingId: input.listingId,
                sku: input.sku ?? null,
                embed: Boolean(input.embed),
                createdAt: nowIso(),
            });
            return {
                redirectUrl: buildEmbedUrl(sessionId, Boolean(input.embed)),
                sessionId,
            };
        },

        verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookVerification {
            const signature = headers['x-fbm-signature'];
            const eventId = headers['x-fbm-event-id'] ?? null;
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

        async createCreatorListing(input: CreatorListingDraftInput): Promise<CreatorListingResult> {
            const id = `stub-${crypto.randomUUID()}`;
            const slug = input.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            listings.set(id, {
                listing: {
                    providerId: PROVIDER_ID,
                    providerListingId: id,
                    category: input.category,
                    title: input.title,
                    description: input.description,
                    priceCents: input.priceCents,
                    currency: input.currency,
                    sellerId: input.sellerUserId,
                    sellerDisplayName: input.sellerUserId,
                    mediaUrls: input.mediaUrls ?? [],
                    entitlementKind: input.entitlementKind,
                    tags: input.tags,
                },
                sellerUserId: input.sellerUserId,
                artifactKind: input.artifactKind,
                artifactPayload: input.artifactPayload,
                publicSlug: slug || id,
                status: 'draft',
                createdAt: nowIso(),
            });
            return {
                providerListingId: id,
                publicSlug: slug || id,
                status: 'draft',
            };
        },

        async publishCreatorListing(providerListingId: string): Promise<CreatorListingResult> {
            const entry = listings.get(providerListingId);
            if (!entry) throw new Error(`stub: unknown listing ${providerListingId}`);
            entry.status = 'published';
            return {
                providerListingId,
                publicSlug: entry.publicSlug,
                status: 'published',
            };
        },

        async archiveCreatorListing(providerListingId: string): Promise<void> {
            listings.delete(providerListingId);
        },

        async startCreatorOnboarding(
            sellerUserId: string,
            returnUrl?: string
        ): Promise<CreatorOnboardingHandle> {
            const url = new URL(
                buildEmbedUrl(`onboarding-${sellerUserId}`, false),
                apiBaseUrl || 'https://stub.freeblackmarket.local'
            );
            if (returnUrl) url.searchParams.set('return', returnUrl);
            return {
                onboardingUrl: url.toString(),
                expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            };
        },

        async issueSignedBundle(
            entitlement: NormalizedEntitlement
        ): Promise<SignedPluginBundleEnvelope> {
            const entry = listings.get(entitlement.providerListingId);
            if (!entry) throw new Error('stub: no listing for entitlement');
            return buildSignedBundle(entry);
        },
    };

    const internals: FreeblackmarketStubInternals = {
        getSession(sessionId: string) {
            return sessions.get(sessionId);
        },
        materializeWebhook(sessionId: string) {
            const session = sessions.get(sessionId);
            if (!session) return null;
            const entry = listings.get(session.listingId);
            if (!entry) return null;
            const eventId = `stub-evt-${sessionId}`;
            const body = JSON.stringify({
                eventId,
                type: 'purchase.succeeded',
                userId: session.userId,
                providerListingId: session.listingId,
                sku: session.sku,
                kind: entry.listing.entitlementKind,
                occurredAt: nowIso(),
                metadata: {
                    sessionId,
                    artifactKind: entry.artifactKind,
                },
            });
            const signature = crypto
                .createHmac('sha256', webhookSecret)
                .update(body)
                .digest('hex');
            return { body, signature, eventId };
        },
        reset() {
            listings.clear();
            for (const seed of SEEDED_LISTINGS) {
                listings.set(seed.listing.providerListingId, { ...seed });
            }
            sessions.clear();
        },
    };

    stubInternalsByInstance.set(provider, internals);
    return provider;
}
