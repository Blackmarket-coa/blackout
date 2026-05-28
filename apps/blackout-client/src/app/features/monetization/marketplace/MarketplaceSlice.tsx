import { createElement, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
    categoryLabel,
    type MarketplaceCategory,
    type MarketplaceProviderId,
    type NormalizedEntitlement,
    type NormalizedListing,
} from '@blackout/core';
import {
    fetchEntitlements,
    fetchListings,
    fetchProviders,
    startCheckout,
    type MarketplaceProviderSummary,
} from './marketplaceClient';
import { readBlackoutApiToken } from './useMarketplaceAuth';
import { ensureBlackoutApiToken } from '../../../../client/blackoutApiSession';
import { ListingCard } from './ListingCard';
import { LibraryView } from './LibraryView';
import { resolveMarketplaceProvider } from './providerMetadata';
import { EmbeddedCheckoutOverlay } from './EmbeddedCheckoutOverlay';

type View = 'catalog' | 'library';

interface CategoryTab {
    id: MarketplaceCategory | 'all';
    label: string;
}

const browseCategories: MarketplaceCategory[] = [
    'emoji-sticker',
    'meme-asset',
    'stego-software',
    'plugin-curated',
    'subscription',
    'profile-cosmetic',
    'audio-pack',
    'community-template',
    'creator-asset',
    'security-tool',
    'ai-automation',
];

const categoryTabs: CategoryTab[] = [
    { id: 'all', label: 'All' },
    ...browseCategories.map((id) => ({ id, label: categoryLabel(id) })),
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
    const [activeCheckout, setActiveCheckout] = useState<{
        redirectUrl: string;
        sessionId: string;
        embed: boolean;
    } | null>(null);

    const token = useMemo(() => readBlackoutApiToken(), []);

    const refreshEntitlements = useCallback(async () => {
        // Resolve a token (awaiting the Matrix→API exchange if it hasn't
        // landed yet); skip the request entirely when signed out so we don't
        // fire a guaranteed-401 at /v1/marketplace/entitlements.
        const activeToken = token ?? (await ensureBlackoutApiToken());
        if (!activeToken) {
            setEntitlements([]);
            return;
        }
        try {
            setEntitlements(await fetchEntitlements(activeToken));
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
            const summary = providers.find((p) => p.id === listing.providerId);
            const supportsEmbed = summary?.capabilities.includes('embedded-checkout') ?? false;
            try {
                const result = await startCheckout(
                    {
                        providerId: listing.providerId,
                        listingId: listing.providerListingId,
                        returnUrl: window.location.href,
                        embed: supportsEmbed,
                    },
                    token
                );
                if (result.embed && supportsEmbed) {
                    setActiveCheckout({
                        redirectUrl: result.redirectUrl,
                        sessionId: result.sessionId,
                        embed: true,
                    });
                } else {
                    try {
                        const parsed = new URL(result.redirectUrl);
                        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                            window.open(result.redirectUrl, '_blank', 'noopener,noreferrer');
                        }
                    } catch {
                        // Invalid redirect URL — silently skip
                    }
                    setTimeout(() => void refreshEntitlements(), 3_000);
                }
            } catch (err) {
                setError('Checkout could not be started. Please try again.');
                console.warn('[marketplace] checkout failed', err);
            } finally {
                setPurchasingId(null);
            }
        },
        [providers, refreshEntitlements, token]
    );

    const closeCheckout = useCallback(() => {
        setActiveCheckout(null);
    }, []);

    const handleCheckoutCompleted = useCallback(() => {
        setActiveCheckout(null);
        void refreshEntitlements();
    }, [refreshEntitlements]);

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
            : createElement(LibraryView, { entitlements, providers }),
        activeCheckout
            ? createElement(EmbeddedCheckoutOverlay, {
                  redirectUrl: activeCheckout.redirectUrl,
                  sessionId: activeCheckout.sessionId,
                  onCompleted: handleCheckoutCompleted,
                  onCancelled: closeCheckout,
                  onError: closeCheckout,
              })
            : null
    );
}
