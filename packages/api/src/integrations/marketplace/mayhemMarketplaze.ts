import type { MarketplaceProvider } from '@blackout/core';
import { assertStubProviderDisabledForProduction, createStubProvider } from './stubProvider';

export function assertMayhemMarketplazeDisabledForProduction(
    env: NodeJS.ProcessEnv = process.env
): void {
    assertStubProviderDisabledForProduction(
        'mayhem-marketplaze',
        'MAYHEM_MARKETPLAZE_ENABLED',
        env
    );
}

export function createMayhemMarketplazeProvider(): MarketplaceProvider {
    return createStubProvider({
        id: 'mayhem-marketplaze',
        displayName: 'Mayhem Marketplaze',
        defaultBaseUrl: 'https://api.mayhem-marketplaze.example',
        envBaseUrlKey: 'MAYHEM_MARKETPLAZE_BASE_URL',
        envEnabledKey: 'MAYHEM_MARKETPLAZE_ENABLED',
        auth: 'hmac-shared-secret',
        capabilities: ['catalog', 'checkout', 'webhooks'],
    });
}
