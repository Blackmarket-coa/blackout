import type { MarketplaceProvider, MarketplaceProviderId } from '@blackout/core';
import { createFreeblackmarketProvider } from './freeblackmarket';
import { createBlamazonProvider } from './blamazon';
import { createMayhemMarketplazeProvider } from './mayhemMarketplaze';
import { createAntinAmazonProvider } from './antinAmazon';

let cachedRegistry: Map<MarketplaceProviderId, MarketplaceProvider> | null = null;

function buildRegistry(): Map<MarketplaceProviderId, MarketplaceProvider> {
    const providers: MarketplaceProvider[] = [
        createFreeblackmarketProvider(),
        createBlamazonProvider(),
        createMayhemMarketplazeProvider(),
        createAntinAmazonProvider(),
    ];
    return new Map(providers.map((provider) => [provider.id, provider]));
}

export function getMarketplaceRegistry(): Map<MarketplaceProviderId, MarketplaceProvider> {
    if (!cachedRegistry) cachedRegistry = buildRegistry();
    return cachedRegistry;
}

export function resetMarketplaceRegistry(): void {
    cachedRegistry = null;
}

export function getMarketplaceProvider(id: MarketplaceProviderId): MarketplaceProvider | undefined {
    return getMarketplaceRegistry().get(id);
}

export function listEnabledProviders(): MarketplaceProvider[] {
    return [...getMarketplaceRegistry().values()].filter((provider) => provider.enabled);
}

export { createFreeblackmarketProvider, createBlamazonProvider, createMayhemMarketplazeProvider, createAntinAmazonProvider };
