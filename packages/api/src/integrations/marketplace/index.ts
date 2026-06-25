import type { MarketplaceProvider, MarketplaceProviderId } from '@blackout/core';
import { createFreeblackmarketProvider } from './freeblackmarket';
import {
    createFreeblackmarketStubProvider,
    shouldUseFreeblackmarketStub,
} from './freeblackmarketStub';
import { createBlamazonProvider } from './blamazon';
import { createMayhemMarketplazeProvider } from './mayhemMarketplaze';
import { createAntinAmazonProvider } from './antinAmazon';
import { logEvent } from '../../services/marketplaceObservability';

let cachedRegistry: Map<MarketplaceProviderId, MarketplaceProvider> | null = null;

function buildRegistry(): Map<MarketplaceProviderId, MarketplaceProvider> {
    // Each provider is constructed independently. A factory that throws (e.g.
    // freeblackmarket refusing to start in production without its secrets) must
    // not take down the rest of the marketplace — skip the failed provider, log
    // it, and keep the others.
    const factories: Array<() => MarketplaceProvider> = [
        () =>
            shouldUseFreeblackmarketStub()
                ? createFreeblackmarketStubProvider()
                : createFreeblackmarketProvider(),
        createBlamazonProvider,
        createMayhemMarketplazeProvider,
        createAntinAmazonProvider,
    ];
    const registry = new Map<MarketplaceProviderId, MarketplaceProvider>();
    for (const factory of factories) {
        try {
            const provider = factory();
            registry.set(provider.id, provider);
        } catch (error) {
            logEvent('marketplace.registry.provider_init_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return registry;
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

export {
    createFreeblackmarketProvider,
    createFreeblackmarketStubProvider,
    shouldUseFreeblackmarketStub,
    createBlamazonProvider,
    createMayhemMarketplazeProvider,
    createAntinAmazonProvider,
};
