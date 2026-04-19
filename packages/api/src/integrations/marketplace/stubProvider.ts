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

function envBool(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    if (raw === undefined) return fallback;
    return raw === '1' || raw.toLowerCase() === 'true';
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

        verifyWebhook(_rawBody: string, headers: Record<string, string | undefined>): WebhookVerification {
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
