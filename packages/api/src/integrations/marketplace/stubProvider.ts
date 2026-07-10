import type {
    CatalogQuery,
    CheckoutInput,
    CheckoutResult,
    MarketplaceAuthScheme,
    MarketplaceCapability,
    MarketplaceProvider,
    MarketplaceProviderId,
    NormalizedLifecycleEvent,
    NormalizedListing,
    WebhookVerification,
} from '@blackout/core';

interface StubProviderConfig {
    id: MarketplaceProviderId;
    displayName: string;
    defaultBaseUrl: string;
    envBaseUrlKey: string;
    envEnabledKey: string;
    auth: MarketplaceAuthScheme;
    capabilities: readonly MarketplaceCapability[];
}

function envBool(key: string, fallback: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
    const raw = env[key];
    if (raw === undefined) return fallback;
    return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * Placeholder marketplace providers (blamazon / mayhem-marketplaze / antin-amazon)
 * have no real adapter: they return empty catalogs, throw on checkout, and reject
 * webhook verification. Enabling one in production would let a deploy pretend to be a
 * marketplace while silently no-op'ing. This guard refuses to start in that case.
 *
 * Mirrors `assertFreeblackmarketSecretsForProduction` in `./freeblackmarket.ts`.
 */
export function assertStubProviderDisabledForProduction(
    id: MarketplaceProviderId,
    envEnabledKey: string,
    env: NodeJS.ProcessEnv = process.env
): void {
    if (env.NODE_ENV !== 'production') return;
    if (envBool(envEnabledKey, false, env) === false) return;
    throw new Error(
        `[${id}] Refusing to start in production: ${envEnabledKey}=true but ${id} is a ` +
            `placeholder integration with no real adapter. Unset ${envEnabledKey} (or set it ` +
            `to false) until a real adapter is implemented.`
    );
}

export function createStubProvider(config: StubProviderConfig): MarketplaceProvider {
    const baseUrl = process.env[config.envBaseUrlKey] ?? config.defaultBaseUrl;
    const enabled = envBool(config.envEnabledKey, false);

    return {
        id: config.id,
        displayName: config.displayName,
        baseUrl,
        enabled,
        auth: config.auth,
        capabilities: config.capabilities,

        async fetchCatalog(_query: CatalogQuery): Promise<NormalizedListing[]> {
            return [];
        },

        async getListing(_listingId: string): Promise<NormalizedListing | null> {
            return null;
        },

        async createCheckoutSession(_input: CheckoutInput): Promise<CheckoutResult> {
            throw new Error(`${config.id} checkout not yet implemented`);
        },

        verifyWebhook(
            _rawBody: string,
            headers: Record<string, string | undefined>
        ): WebhookVerification {
            return {
                ok: false,
                eventId: headers['x-event-id'] ?? null,
                reason: `${config.id} webhook adapter not yet implemented`,
            };
        },

        parseEvent(_payload: unknown): NormalizedLifecycleEvent | null {
            return null;
        },
    };
}
