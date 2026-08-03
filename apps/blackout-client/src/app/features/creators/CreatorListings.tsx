import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { CREATOR_SELL_PATH } from '../../pages/paths';
import { useConfirm } from '../../components/confirm-dialog';
import {
    archiveCreatorListing,
    createCreatorListing,
    fetchCreatorProviders,
    fetchMyCreatorListings,
    publishCreatorListing,
    startCreatorPayoutOnboarding,
    type CreatorArtifactKind,
    type CreatorListingView,
    type CreatorProvidersResponse,
} from './creatorClient';
import {
    categoryForArtifact,
    entitlementForArtifact,
    CREATOR_ARTIFACT_KINDS,
    CREATOR_ARTIFACT_LABELS,
} from './creatorArtifactMap';
import { ARTIFACT_FORM_REGISTRY } from './sell/artifactFormRegistry';

/**
 * The registry's prefilled default payload for a kind — the same values the
 * guided wizard opens with, so a quick-create draft carries a valid example
 * shape instead of an empty object the seller then has to replace elsewhere.
 */
function defaultPayloadForKind(kind: CreatorArtifactKind): unknown {
    const descriptor = ARTIFACT_FORM_REGISTRY[kind];
    try {
        return descriptor.buildPayload(descriptor.defaults);
    } catch {
        return {};
    }
}

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

const composerCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
};

const inputStyle: CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    width: '100%',
    fontSize: 13,
};

const fieldLabelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

interface ListingDraftState {
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    providerId: string;
    artifactKind: CreatorArtifactKind;
}

const emptyDraft = (providerId: string): ListingDraftState => ({
    title: '',
    description: '',
    priceCents: 0,
    currency: 'USD',
    providerId,
    artifactKind: 'stream_asset',
});

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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [onboardingProvider, setOnboardingProvider] = useState<string | null>(null);
    const [composerOpen, setComposerOpen] = useState(false);
    const [draft, setDraft] = useState<ListingDraftState>(() => emptyDraft(''));
    const [creating, setCreating] = useState(false);
    const confirm = useConfirm();

    const refresh = useCallback(async () => {
        setError(null);
        try {
            const [providersRes, listingsRes] = await Promise.all([
                fetchCreatorProviders(),
                fetchMyCreatorListings(),
            ]);
            setProviders(providersRes.providers);
            setListings(listingsRes.listings);
            // Seed the composer's provider once we know the available providers.
            setDraft((prev) =>
                prev.providerId
                    ? prev
                    : { ...prev, providerId: providersRes.providers[0]?.id ?? '' }
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to load creator listings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleCreate = async () => {
        // The server requires a non-empty title and description
        // (creator.ts draftSchema: title/description z.string().min(1)).
        if (!draft.title.trim() || !draft.description.trim() || !draft.providerId) return;
        setCreating(true);
        setError(null);
        try {
            await createCreatorListing({
                providerId: draft.providerId,
                artifactKind: draft.artifactKind,
                category: categoryForArtifact(draft.artifactKind),
                entitlementKind: entitlementForArtifact(draft.artifactKind),
                title: draft.title.trim(),
                description: draft.description.trim(),
                priceCents: draft.priceCents,
                currency: draft.currency.trim() || 'USD',
                // The server requires a payload (or upload id). Match the guided
                // wizard's prefilled defaults for the chosen kind so the draft
                // carries a valid example shape (the wizard remains the place to
                // actually author it).
                artifactPayload: defaultPayloadForKind(draft.artifactKind),
            });
            setDraft(emptyDraft(draft.providerId));
            setComposerOpen(false);
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to create listing');
        } finally {
            setCreating(false);
        }
    };

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
        const confirmation = await confirm({
            title: 'Archive listing?',
            description: (
                <>
                    Archive <strong>{listing.title}</strong>? It will be hidden from buyers and
                    removed from your active listings.
                </>
            ),
            confirmLabel: 'Archive',
        });
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
            if (typeof handle.onboardingUrl === 'string') {
                window.open(handle.onboardingUrl, '_blank', 'noopener,noreferrer');
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
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                    }}
                >
                    <h1 style={titleStyle}>Creator listings</h1>
                    <div
                        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                        <Link
                            to={CREATOR_SELL_PATH}
                            style={{ ...accentButton, textDecoration: 'none' }}
                            data-testid="creator-listing-guided-link"
                        >
                            Guided sell flow
                        </Link>
                        <button
                            type="button"
                            style={accentButton}
                            onClick={() => setComposerOpen((open) => !open)}
                            data-testid="creator-listing-new-toggle"
                            aria-expanded={composerOpen}
                        >
                            {composerOpen ? 'Close' : 'New listing'}
                        </button>
                    </div>
                </div>
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

                {composerOpen ? (
                    <form
                        style={composerCardStyle}
                        data-testid="creator-listing-composer"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleCreate();
                        }}
                    >
                        <strong style={{ fontSize: 14 }}>Create a listing</strong>
                        <label style={fieldLabelStyle}>
                            Title
                            <input
                                style={inputStyle}
                                value={draft.title}
                                onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, title: e.target.value }))
                                }
                                data-testid="creator-listing-composer-title"
                            />
                        </label>
                        <label style={fieldLabelStyle}>
                            Description
                            <textarea
                                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                                rows={3}
                                value={draft.description}
                                onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, description: e.target.value }))
                                }
                                data-testid="creator-listing-composer-description"
                            />
                        </label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <label style={{ ...fieldLabelStyle, flex: 1, minWidth: 120 }}>
                                Type
                                <select
                                    style={inputStyle}
                                    value={draft.artifactKind}
                                    onChange={(e) =>
                                        setDraft((prev) => ({
                                            ...prev,
                                            artifactKind: e.target.value as CreatorArtifactKind,
                                        }))
                                    }
                                >
                                    {CREATOR_ARTIFACT_KINDS.map((kind) => (
                                        <option key={kind} value={kind}>
                                            {CREATOR_ARTIFACT_LABELS[kind]}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label style={{ ...fieldLabelStyle, width: 100 }}>
                                Price (¢)
                                <input
                                    type="number"
                                    min={0}
                                    style={inputStyle}
                                    value={draft.priceCents}
                                    onChange={(e) =>
                                        setDraft((prev) => ({
                                            ...prev,
                                            priceCents: Number.parseInt(e.target.value, 10) || 0,
                                        }))
                                    }
                                />
                            </label>
                            <label style={{ ...fieldLabelStyle, width: 90 }}>
                                Currency
                                <input
                                    style={inputStyle}
                                    value={draft.currency}
                                    onChange={(e) =>
                                        setDraft((prev) => ({ ...prev, currency: e.target.value }))
                                    }
                                />
                            </label>
                        </div>
                        {providers.length > 0 ? (
                            <label style={fieldLabelStyle}>
                                Provider
                                <select
                                    style={inputStyle}
                                    value={draft.providerId}
                                    onChange={(e) =>
                                        setDraft((prev) => ({
                                            ...prev,
                                            providerId: e.target.value,
                                        }))
                                    }
                                >
                                    {providers.map((provider) => (
                                        <option key={provider.id} value={provider.id}>
                                            {provider.displayName}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <span style={listingMetaStyle}>
                                No payout provider is available yet — connect one below before
                                creating a listing.
                            </span>
                        )}
                        <button
                            type="submit"
                            style={accentButton}
                            disabled={
                                creating ||
                                !draft.title.trim() ||
                                !draft.description.trim() ||
                                !draft.providerId
                            }
                            data-testid="creator-listing-composer-submit"
                        >
                            {creating ? 'Creating…' : 'Create listing'}
                        </button>
                    </form>
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

                {loading ? (
                    <p
                        style={{
                            color: 'var(--text-muted, #9ca3af)',
                            fontSize: 13,
                            margin: 0,
                        }}
                        data-testid="creator-listings-loading"
                    >
                        Loading your listings…
                    </p>
                ) : listings.length === 0 ? (
                    <p
                        style={{
                            color: 'var(--text-muted, #9ca3af)',
                            fontSize: 13,
                            margin: 0,
                        }}
                        data-testid="creator-listings-empty"
                    >
                        You haven't created any listings yet. Use <strong>New listing</strong> above
                        to create one — drafts appear here and can be published or archived.
                        Listings created in the FBM seller dashboard also sync in automatically.
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
