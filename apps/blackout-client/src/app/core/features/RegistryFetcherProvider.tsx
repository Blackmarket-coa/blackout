import React, { createContext, useContext, type PropsWithChildren } from 'react';
import type { RegistryFetcherKey, RegistryFetchers } from './registryFetchers';

const RegistryFetcherContext = createContext<Partial<RegistryFetchers> | null>(null);

type ProviderProps = PropsWithChildren<{
    /** Bag of page fetchers — typically the result of `buildRegistryFetchers(apiClient)`. */
    fetchers: Partial<RegistryFetchers>;
}>;

/**
 * Provider that exposes a `RegistryFetchers` bag (or any subset) to
 * registry-mounted pages. Tests typically pass an explicit `fetcher`
 * prop and skip this provider; production wires the full bag once at
 * boot via `buildRegistryFetchers(apiClient)`.
 */
export function RegistryFetcherProvider({ fetchers, children }: ProviderProps) {
    return (
        <RegistryFetcherContext.Provider value={fetchers}>
            {children}
        </RegistryFetcherContext.Provider>
    );
}

/**
 * Hook returning the fetcher for the supplied key, or `null` when the
 * provider isn't mounted (or hasn't supplied that key). Pages compose
 * this with their explicit `fetcher` prop:
 *
 *   const ctx = useRegistryFetcher('stegoToolkit');
 *   const effective = explicitFetcher ?? ctx ?? stub;
 */
export function useRegistryFetcher<TKey extends RegistryFetcherKey>(
    key: TKey
): RegistryFetchers[TKey] | null {
    const value = useContext(RegistryFetcherContext);
    if (!value) return null;
    return (value[key] as RegistryFetchers[TKey] | undefined) ?? null;
}
