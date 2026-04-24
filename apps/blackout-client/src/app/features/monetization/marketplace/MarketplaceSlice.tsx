import { createElement, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type {
    MarketplaceCategory,
    MarketplaceProviderId,
    NormalizedEntitlement,
    NormalizedListing,
} from '@blackout/core';
import {
    fetchEntitlements,
    fetchListings,
    fetchProviders,
    startCheckout,
    type MarketplaceProviderSummary,
} from './marketplaceClient';
import { readBlackoutApiToken } from './useMarketplaceAuth';
import { ListingCard } from './ListingCard';
import { LibraryView } from './LibraryView';
import { resolveMarketplaceProvider } from './providerMetadata';

type View = 'catalog' | 'library';

interface CategoryTab {
    id: MarketplaceCategory | 'all';
    label: string;
}

const categoryTabs: CategoryTab[] = [
    { id: 'all', label: 'All' },
    { id: 'emoji-sticker', label: 'Emoji & Stickers' },
    { id: 'meme-asset', label: 'Memes & Assets' },
    { id: 'stego-software', label: 'Stego & Software' },
    { id: 'plugin-curated', label: 'Plugins (Curated)' },
    { id: 'subscription', label: 'Subscriptions' },
];

const chipStyle = (active: boolean): Record<string, string | number> => ({
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: active ? 'var(--bg-accent)' : 'var(--bg-surface)',
    color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 12,
});

function ownedListingKey(entitlement: NormalizedEntitlement): string {
    return `${entitlement.providerId}:${entitlement.providerListingId}`;
}

function listingKey(listing: NormalizedListing): string {
    return `${listing.providerId}:${listing.providerListingId}`;
}

export function MarketplaceSlice() {
    const [view, setView] = useState<View>('catalog');
    const [providers, setProviders] = useState<MarketplaceProviderSummary[]>([]);
    const [providerFilter, setProviderFilter] = useState<MarketplaceProviderId | 'all'>('all');
    const [categoryFilter, setCategoryFilter] = useState<MarketplaceCategory | 'all'>('all');
    const [query, setQuery] = useState('');
    const [listings, setListings] = useState<NormalizedListing[]>([]);
    const [entitlements, setEntitlements] = useState<NormalizedEntitlement[]>([]);
    const [loadingCatalog, setLoadingCatalog] = useState(false);
    const [purchasingId, setPurchasingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);

    const token = useMemo(() => readBlackoutApiToken(), []);

    const refreshEntitlements = useCallback(async () => {
        try {
            setEntitlements(await fetchEntitlements(token));
        } catch (err) {
            console.warn('[marketplace] failed to load entitlements', err);
        }
    }, [token]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [providerList] = await Promise.all([fetchProviders(token), refreshEntitlements()]);
                if (cancelled) return;
                setProviders(providerList);
            } catch (err) {
                if (!cancelled)
                    setError('Unable to load marketplace providers. Try again shortly.');
                console.warn('[marketplace] failed to load providers', err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refreshEntitlements, token]);

    useEffect(() => {
        let cancelled = false;
        setLoadingCatalog(true);
        (async () => {
            try {
                const list = await fetchListings(
                    {
                        providerId: providerFilter === 'all' ? undefined : providerFilter,
                        category: categoryFilter === 'all' ? undefined : categoryFilter,
                        q: query.trim() || undefined,
                    },
                    token
                );
                if (!cancelled) setListings(list);
            } catch (err) {
                if (!cancelled) setError('Unable to load listings.');
                console.warn('[marketplace] failed to load listings', err);
            } finally {
                if (!cancelled) setLoadingCatalog(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [providerFilter, categoryFilter, query, token]);

    useEffect(() => {
        function onFocus() {
            void refreshEntitlements();
        }
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [refreshEntitlements]);

    const ownedKeys = useMemo(() => {
        return new Set(
            entitlements
                .filter((entitlement) => entitlement.status === 'granted')
                .map(ownedListingKey)
        );
    }, [entitlements]);

    const handlePurchase = useCallback(
        async (listing: NormalizedListing) => {
            const key = listingKey(listing);
            setPurchasingId(key);
            setError(null);
            const provider = resolveMarketplaceProvider(listing.providerId, providers);
            setCheckoutNotice(provider.checkoutDisclosure);
            try {
                const result = await startCheckout(
                    {
                        providerId: listing.providerId,
                        listingId: listing.providerListingId,
                        returnUrl: window.location.href,
                    },
                    token
                );
                window.open(result.redirectUrl, '_blank', 'noopener,noreferrer');
                setTimeout(() => void refreshEntitlements(), 3_000);
            } catch (err) {
                setError('Checkout could not be started. Please try again.');
                console.warn('[marketplace] checkout failed', err);
            } finally {
                setPurchasingId(null);
            }
        },
        [providers, refreshEntitlements, token]
    );

    const providerChips = createElement(
        'div',
        { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        createElement(
            'button',
            {
                type: 'button',
                style: chipStyle(providerFilter === 'all'),
                onClick: () => setProviderFilter('all'),
            },
            'All providers'
        ),
        ...providers
            .filter((provider) => provider.enabled)
            .map((provider) =>
                createElement(
                    'button',
                    {
                        key: provider.id,
                        type: 'button',
                        style: chipStyle(providerFilter === provider.id),
                        onClick: () => setProviderFilter(provider.id),
                    },
                    `${provider.presentation.icon} ${provider.presentation.label}`
                )
            )
    );

    const categoryChips = createElement(
        'div',
        { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        ...categoryTabs.map((tab) =>
            createElement(
                'button',
                {
                    key: tab.id,
                    type: 'button',
                    style: chipStyle(categoryFilter === tab.id),
                    onClick: () => setCategoryFilter(tab.id as MarketplaceCategory | 'all'),
                },
                tab.label
            )
        )
    );

    const viewSwitch = createElement(
        'div',
        { style: { display: 'flex', gap: 6 } },
        createElement(
            'button',
            {
                type: 'button',
                style: chipStyle(view === 'catalog'),
                onClick: () => setView('catalog'),
            },
            'Catalog'
        ),
        createElement(
            'button',
            {
                type: 'button',
                style: chipStyle(view === 'library'),
                onClick: () => {
                    setView('library');
                    void refreshEntitlements();
                },
            },
            `Library (${entitlements.length})`
        )
    );

    const catalog =
        listings.length === 0
            ? createElement(
                  'p',
                  { style: { margin: 0, color: 'var(--text-secondary)' } },
                  loadingCatalog
                      ? 'Loading listings…'
                      : 'No listings match these filters.'
              )
            : createElement(
                  'div',
                  {
                      style: {
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                          gap: 10,
                      },
                  },
                  ...listings.map((listing) =>
                      createElement(ListingCard, {
                          key: listingKey(listing),
                          listing,
                          providers,
                          onPurchase: handlePurchase,
                          purchasing: purchasingId === listingKey(listing),
                          alreadyOwned: ownedKeys.has(listingKey(listing)),
                      })
                  )
              );

    const searchInput = createElement('input', {
        type: 'search',
        value: query,
        placeholder: 'Search listings…',
        onChange: (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
        style: {
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--border-default)',
            background: 'var(--bg-input)',
            color: 'var(--text-default)',
            minWidth: 180,
        },
    });

    return createElement(
        'section',
        { style: { display: 'grid', gap: 12 } },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Browse federated listings from connected marketplaces. Provider badges, payout cadence, refund terms, and support policies are shown before checkout.'
        ),
        viewSwitch,
        checkoutNotice
            ? createElement(
                  'p',
                  { style: { margin: 0, fontSize: 12, color: 'var(--text-secondary)' } },
                  checkoutNotice
              )
            : null,
        error
            ? createElement(
                  'div',
                  {
                      style: {
                          padding: 8,
                          borderRadius: 8,
                          background: 'var(--bg-danger)',
                          color: 'var(--text-on-danger)',
                          fontSize: 13,
                      },
                  },
                  error
              )
            : null,
        view === 'catalog'
            ? createElement(
                  'div',
                  { style: { display: 'grid', gap: 10 } },
                  createElement(
                      'div',
                      { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
                      searchInput
                  ),
                  providerChips,
                  categoryChips,
                  catalog
              )
            : createElement(LibraryView, { entitlements, providers })
    );
}
