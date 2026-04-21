import type { MarketplaceProvider } from '@blackout/core';
import { createStubProvider } from './stubProvider';

export function createAntinAmazonProvider(): MarketplaceProvider {
    return createStubProvider({
        id: 'antin-amazon',
        displayName: 'Antin Amazon',
        defaultBaseUrl: 'https://api.antin-amazon.example',
        envBaseUrlKey: 'ANTIN_AMAZON_BASE_URL',
        envEnabledKey: 'ANTIN_AMAZON_ENABLED',
        auth: 'api-key',
        capabilities: ['catalog', 'search', 'checkout', 'webhooks', 'payouts'],
    });
}
