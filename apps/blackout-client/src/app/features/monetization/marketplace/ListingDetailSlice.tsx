import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { categoryLabel, type NormalizedListing } from '@blackout/core';
import {
    fetchEntitlements,
    fetchListingDetail,
    fetchProviders,
    fetchVendorMatrixId,
    startCheckout,
    type MarketplaceProviderSummary,
} from './marketplaceClient';
import { readBlackoutApiToken } from './useMarketplaceAuth';
import { ensureBlackoutApiToken } from '../../../../client/blackoutApiSession';
import { getDirectCreatePath, withSearchParam } from '../../../pages/pathUtils';
import { MARKET_PATH, type DirectCreateSearchParams } from '../../../pages/paths';
import { resolveMarketplaceProvider } from './providerMetadata';
import { EmbeddedCheckoutOverlay } from './EmbeddedCheckoutOverlay';
import { useExternalPurchasePolicy } from '../../../hooks/useExternalPurchasePolicy';
import {
    openExternalCheckoutUrl,
    resolveCheckoutReturnUrl,
} from '../../../../platform/external-purchase';

type LoadState = 'loading' | 'not_found' | 'error' | 'loaded';

function formatPrice(priceCents: number, currency: string): string {
    return `${(priceCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

const isNotFound = (err: unknown): boolean => (err as { status?: number } | null)?.status === 404;

/**
 * Buyer-facing detail view for a single marketplace listing, addressed by the
 * (provider, provider-listing) pair. Reuses the same client wrappers and
 * checkout/message-vendor flows as the `/market` grid (`MarketplaceSlice`).
 */
export function ListingDetailSlice() {
    const { providerId, listingId } = useParams<{ providerId: string; listingId: string }>();
    const navigate = useNavigate();

    const [state, setState] = useState<LoadState>('loading');
    const [listing, setListing] = useState<NormalizedListing | null>(null);
    const [providers, setProviders] = useState<MarketplaceProviderSummary[]>([]);
    const [owned, setOwned] = useState(false);
    const [purchasing, setPurchasing] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
    const [activeCheckout, setActiveCheckout] = useState<{
        redirectUrl: string;
        sessionId: string;
    } | null>(null);

    const token = useMemo(() => readBlackoutApiToken(), []);
    const purchasePolicy = useExternalPurchasePolicy();

    useEffect(() => {
        if (!providerId || !listingId) {
            setState('not_found');
            return undefined;
        }
        let cancelled = false;
        setState('loading');
        (async () => {
            try {
                const detail = await fetchListingDetail(providerId as never, listingId, token);
                if (cancelled) return;
                setListing(detail);
                setState('loaded');
            } catch (err) {
                if (cancelled) return;
                setState(isNotFound(err) ? 'not_found' : 'error');
                console.warn('[marketplace] failed to load listing detail', err);
            }
        })();
        // Provider trust metadata and ownership are progressive enhancements —
        // the detail renders with fallbacks when either fetch fails.
        (async () => {
            try {
                const providerList = await fetchProviders(token);
                if (!cancelled) setProviders(providerList);
            } catch (err) {
                console.warn('[marketplace] failed to load providers', err);
            }
        })();
        (async () => {
            const activeToken = token ?? (await ensureBlackoutApiToken());
            if (!activeToken || cancelled) return;
            try {
                const entitlements = await fetchEntitlements(activeToken);
                if (cancelled) return;
                setOwned(
                    entitlements.some(
                        (entitlement) =>
                            entitlement.status === 'granted' &&
                            entitlement.providerId === providerId &&
                            entitlement.providerListingId === listingId
                    )
                );
            } catch (err) {
                console.warn('[marketplace] failed to load entitlements', err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [providerId, listingId, token]);

    const provider = useMemo(
        () => (providerId ? resolveMarketplaceProvider(providerId, providers) : null),
        [providerId, providers]
    );

    const handlePurchase = useCallback(async () => {
        if (!listing || !provider) return;
        setPurchasing(true);
        setActionError(null);
        setCheckoutNotice(provider.checkoutDisclosure);
        const summary = providers.find((p) => p.id === listing.providerId);
        const supportsEmbed =
            purchasePolicy.mode === 'embedded' &&
            (summary?.capabilities.includes('embedded-checkout') ?? false);
        try {
            const result = await startCheckout(
                {
                    providerId: listing.providerId,
                    listingId: listing.providerListingId,
                    returnUrl: resolveCheckoutReturnUrl(window.location.href),
                    embed: supportsEmbed,
                },
                token
            );
            if (result.embed && supportsEmbed) {
                setActiveCheckout({
                    redirectUrl: result.redirectUrl,
                    sessionId: result.sessionId,
                });
            } else {
                await openExternalCheckoutUrl(result.redirectUrl);
            }
        } catch (err) {
            setActionError('Checkout could not be started. Please try again.');
            console.warn('[marketplace] checkout failed', err);
        } finally {
            setPurchasing(false);
        }
    }, [listing, provider, providers, purchasePolicy.mode, token]);

    const handleMessageVendor = useCallback(async () => {
        if (!listing?.sellerId) return;
        setActionError(null);
        try {
            const activeToken = token ?? (await ensureBlackoutApiToken());
            const { mxid } = await fetchVendorMatrixId(listing.sellerId, activeToken);
            if (!mxid) {
                setActionError('This vendor cannot be messaged yet.');
                return;
            }
            const search: DirectCreateSearchParams = { userId: mxid };
            navigate(withSearchParam(getDirectCreatePath(), search));
        } catch (err) {
            setActionError('Could not start a message with this vendor.');
            console.warn('[marketplace] message vendor failed', err);
        }
    }, [listing, navigate, token]);

    const backLink = (
        <Link to={MARKET_PATH} style={{ color: 'var(--text-link)', fontSize: 13 }}>
            ← Back to the Black Market
        </Link>
    );

    if (state === 'loading') {
        return (
            <section data-testid="market-listing-loading" style={{ display: 'grid', gap: 12 }}>
                {backLink}
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading listing…</p>
            </section>
        );
    }

    if (state === 'not_found') {
        return (
            <section data-testid="market-listing-not-found" style={{ display: 'grid', gap: 12 }}>
                {backLink}
                <h2 style={{ margin: 0 }}>Listing not found</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    This listing may have been removed or its link may be out of date.
                </p>
            </section>
        );
    }

    if (state === 'error' || !listing || !provider) {
        return (
            <section data-testid="market-listing-error" style={{ display: 'grid', gap: 12 }}>
                {backLink}
                <h2 style={{ margin: 0 }}>Unable to load this listing</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Something went wrong fetching the listing. Try again shortly.
                </p>
            </section>
        );
    }

    return (
        <section data-testid="market-listing-detail" style={{ display: 'grid', gap: 12 }}>
            {backLink}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: 'var(--bg-input)',
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                    }}
                >
                    {provider.icon} {provider.displayName}
                    {provider.verificationBadge ? (
                        <strong style={{ fontSize: 10, textTransform: 'uppercase' }}>
                            {provider.verificationBadge}
                        </strong>
                    ) : null}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {categoryLabel(listing.category)}
                </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 24 }}>{listing.title}</h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{listing.description}</p>
            {listing.mediaUrls.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {listing.mediaUrls.map((url) => (
                        <img
                            key={url}
                            src={url}
                            alt={listing.title}
                            style={{
                                maxWidth: 280,
                                width: '100%',
                                borderRadius: 10,
                                border: '1px solid var(--border-default)',
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {listing.tags && listing.tags.length > 0 ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {listing.tags.map((tag) => (
                        <span
                            key={tag}
                            style={{
                                padding: '2px 8px',
                                borderRadius: 999,
                                border: '1px solid var(--border-default)',
                                color: 'var(--text-secondary)',
                                fontSize: 12,
                            }}
                        >
                            #{tag}
                        </span>
                    ))}
                </div>
            ) : null}
            <div style={{ fontSize: 22, fontWeight: 700 }}>
                {formatPrice(listing.priceCents, listing.currency)}
            </div>
            {actionError ? (
                <div
                    data-testid="market-listing-action-error"
                    style={{
                        padding: 8,
                        borderRadius: 8,
                        background: 'var(--bg-danger)',
                        color: 'var(--text-on-danger)',
                        fontSize: 13,
                    }}
                >
                    {actionError}
                </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {purchasePolicy.allowed || owned ? (
                    <button
                        type="button"
                        data-testid="market-listing-purchase"
                        onClick={() => void handlePurchase()}
                        disabled={purchasing || owned}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid var(--border-default)',
                            background: owned ? 'var(--bg-input)' : 'var(--bg-accent)',
                            color: owned ? 'var(--text-secondary)' : 'var(--text-on-accent)',
                            cursor: owned || purchasing ? 'default' : 'pointer',
                        }}
                    >
                        {owned ? 'Owned' : purchasing ? 'Opening checkout…' : 'Purchase'}
                    </button>
                ) : (
                    <p
                        data-testid="market-listing-purchase-unavailable"
                        style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}
                    >
                        Purchasing isn’t available in this app.
                    </p>
                )}
                {listing.sellerId ? (
                    <button
                        type="button"
                        data-testid="market-listing-message-vendor"
                        onClick={() => void handleMessageVendor()}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-default)',
                            cursor: 'pointer',
                        }}
                    >
                        💬 Message vendor
                    </button>
                ) : null}
            </div>
            <div style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                <p style={{ margin: 0 }}>{provider.trustSummary}</p>
                <p style={{ margin: 0 }}>
                    Payouts: {provider.payoutPolicy} Refunds: {provider.refundPolicy}
                </p>
                <p style={{ margin: 0 }}>Support: {provider.supportPolicy}</p>
                <p style={{ margin: 0 }}>{checkoutNotice ?? provider.checkoutDisclosure}</p>
            </div>
            {activeCheckout ? (
                <EmbeddedCheckoutOverlay
                    redirectUrl={activeCheckout.redirectUrl}
                    sessionId={activeCheckout.sessionId}
                    onCompleted={() => setActiveCheckout(null)}
                    onCancelled={() => setActiveCheckout(null)}
                    onError={() => setActiveCheckout(null)}
                />
            ) : null}
        </section>
    );
}

export default ListingDetailSlice;
