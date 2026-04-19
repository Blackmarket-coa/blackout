import type { MarketplaceProvider } from '@blackout/core';
import { createStubProvider } from './stubProvider';

export function createBlamazonProvider(): MarketplaceProvider {
    return createStubProvider({
        id: 'blamazon',
        displayName: 'Blamazon',
        defaultBaseUrl: 'https://api.blamazon.example',
        envBaseUrlKey: 'BLAMAZON_BASE_URL',
        envEnabledKey: 'BLAMAZON_ENABLED',
        auth: 'oauth2',
        capabilities: ['catalog', 'search', 'checkout', 'webhooks'],
    });
}
