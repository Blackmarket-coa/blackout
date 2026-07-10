import type { MarketplaceProvider } from '@blackout/core';
import { assertStubProviderDisabledForProduction, createStubProvider } from './stubProvider';

export function assertAntinAmazonDisabledForProduction(env: NodeJS.ProcessEnv = process.env): void {
    assertStubProviderDisabledForProduction('antin-amazon', 'ANTIN_AMAZON_ENABLED', env);
}

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
