import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import {
    archiveCreatorListing,
    fetchCreatorProviders,
    fetchMyCreatorListings,
    publishCreatorListing,
    startCreatorPayoutOnboarding,
    type CreatorListingView,
    type CreatorProvidersResponse,
} from './creatorClient';

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '16px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };

const subtitleStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '12px 16px 24px',
};

const onboardingCardStyle: CSSProperties = {
    border: '1px dashed var(--accent-primary, #3b82f6)',
    borderRadius: 10,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    color: 'var(--text-primary, #f8fafc)',
};

const listingCardStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 12,
    alignItems: 'flex-start',
    padding: '10px 12px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
};

const listingTitleStyle: CSSProperties = { fontSize: 14, fontWeight: 600 };
const listingMetaStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

const buttonRowStyle: CSSProperties = { display: 'flex', gap: 6 };

const ghostButton: CSSProperties = {
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'transparent',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
    cursor: 'pointer',
};

const accentButton: CSSProperties = {
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

const formatPrice = (priceCents: number, currency: string): string => {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
        }).format(priceCents / 100);
    } catch {
        return `${(priceCents / 100).toFixed(2)} ${currency}`;
    }
};

/**
 * Creator-side listing management mounted at `/creator/listings`.
 * Wraps the existing `/v1/creator/*` endpoints — listing CRUD is
 * already implemented server-side; PR 3 only adds the missing client
 * surface. Uses one shared loader for providers + listings so a
 * single 401 surfaces as one error banner instead of a flash of
 * partial content.
 *
 * Onboarding: the first time a provider is selected without an
 * established merchant account, the FBM (or any future provider)
 * onboarding URL is exposed via the existing
 * `/v1/creator/payouts/onboarding` route.
 */
export const CreatorListings = (): JSX.Element => {
    const [providers, setProviders] = useState<CreatorProvidersResponse['providers']>([]);
    const [listings, setListings] = useState<CreatorListingView[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [onboardingProvider, setOnboardingProvider] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setError(null);
        try {
            const [providersRes, listingsRes] = await Promise.all([
                fetchCreatorProviders(),
                fetchMyCreatorListings(),
            ]);
            setProviders(providersRes.providers);
            setListings(listingsRes.listings);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to load creator listings');
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handlePublish = async (listing: CreatorListingView) => {
        setBusyId(listing.id);
        try {
            await publishCreatorListing(listing.id);
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'publish failed');
        } finally {
            setBusyId(null);
        }
    };

    const handleArchive = async (listing: CreatorListingView) => {
        const confirmation = window.confirm(`Archive "${listing.title}"?`);
        if (!confirmation) return;
        setBusyId(listing.id);
        try {
            await archiveCreatorListing(listing.id);
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'archive failed');
        } finally {
            setBusyId(null);
        }
    };

    const handleOnboarding = async (providerId: string) => {
        setOnboardingProvider(providerId);
        try {
            const handle = await startCreatorPayoutOnboarding(providerId, window.location.href);
            if (typeof handle.redirectUrl === 'string') {
                window.open(handle.redirectUrl, '_blank', 'noopener,noreferrer');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'onboarding failed');
        } finally {
            setOnboardingProvider(null);
        }
    };

    return (
        <section style={layoutStyle} data-shell-region="creator-listings">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Creator listings</h1>
                <p style={subtitleStyle}>
                    Publish, manage, and archive products you sell to your{' '}
                    {BLACKOUT_TERMS.canopy.singular} community.
                </p>
            </header>
            <div style={sectionStyle}>
                {error ? (
                    <p
                        style={{
                            color: 'var(--text-danger, #f87171)',
                            fontSize: 13,
                            margin: 0,
                        }}
                    >
                        {error}
                    </p>
                ) : null}

                {providers.length > 0 ? (
                    <div style={onboardingCardStyle} data-testid="creator-onboarding-card">
                        <strong style={{ fontSize: 14 }}>Connect a payout provider</strong>
                        <span style={listingMetaStyle}>
                            Set up your seller account before publishing your first listing.
                        </span>
                        <div style={buttonRowStyle}>
                            {providers.map((provider) => (
                                <button
                                    key={provider.id}
                                    type="button"
                                    style={accentButton}
                                    disabled={onboardingProvider === provider.id}
                                    onClick={() => void handleOnboarding(provider.id)}
                                    data-provider-id={provider.id}
                                >
                                    {onboardingProvider === provider.id
                                        ? 'Opening…'
                                        : `Onboard with ${provider.displayName}`}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                {listings.length === 0 ? (
                    <p
                        style={{
                            color: 'var(--text-muted, #9ca3af)',
                            fontSize: 13,
                            margin: 0,
                        }}
                        data-testid="creator-listings-empty"
                    >
                        You haven't created any listings yet. The composer affordance ships in a
                        follow-up; for now, listings are created via the FBM seller dashboard and
                        appear here automatically.
                    </p>
                ) : (
                    <div
                        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                        data-testid="creator-listings-list"
                    >
                        {listings.map((listing) => (
                            <article
                                key={listing.id}
                                style={listingCardStyle}
                                data-testid="creator-listing-card"
                                data-listing-id={listing.id}
                                data-listing-status={listing.status}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 4,
                                        minWidth: 0,
                                    }}
                                >
                                    <span style={listingTitleStyle}>{listing.title}</span>
                                    <span style={listingMetaStyle}>
                                        {listing.status} · {listing.providerId} ·{' '}
                                        {formatPrice(listing.priceCents, listing.currency)}
                                    </span>
                                </div>
                                <div style={buttonRowStyle}>
                                    {listing.status !== 'published' ? (
                                        <button
                                            type="button"
                                            style={accentButton}
                                            disabled={busyId === listing.id}
                                            onClick={() => void handlePublish(listing)}
                                        >
                                            Publish
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        style={ghostButton}
                                        disabled={busyId === listing.id}
                                        onClick={() => void handleArchive(listing)}
                                    >
                                        Archive
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export default CreatorListings;
