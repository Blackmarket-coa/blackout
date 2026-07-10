import type { MarketplaceProvider } from '@blackout/core';
import { assertStubProviderDisabledForProduction, createStubProvider } from './stubProvider';

export function assertBlamazonDisabledForProduction(env: NodeJS.ProcessEnv = process.env): void {
    assertStubProviderDisabledForProduction('blamazon', 'BLAMAZON_ENABLED', env);
}

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
