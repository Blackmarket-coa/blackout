import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';
import {
    archiveListing,
    createListing,
    fetchCreatorProviders,
    fetchMyListings,
    publishListing,
    startPayoutOnboarding,
    type CreatorArtifactKind,
    type CreatorListingView,
    type CreatorProviderSummary,
    type CreateListingInput,
} from './creatorClient';
import {
    categoryForArtifact,
    entitlementForArtifact,
    CREATOR_ARTIFACT_KINDS,
} from '../../creators/creatorArtifactMap';
import { ARTIFACT_FORM_REGISTRY } from '../../creators/sell/artifactFormRegistry';

type TabId = CreatorArtifactKind | 'listings' | 'payouts';

/**
 * Per-kind payload hint, sourced from the shared artifactFormRegistry (the
 * same source that drives the guided wizard's forms and
 * `docs/guides/creating-blackout-products.md`) so this raw-JSON surface can't
 * drift from the real payload shapes.
 */
function payloadHintFor(kind: CreatorArtifactKind): string {
    const descriptor = ARTIFACT_FORM_REGISTRY[kind];
    if (!descriptor.supportsGuided) return descriptor.fields[0]?.help ?? '';
    return `Example: ${JSON.stringify(descriptor.example)}`;
}

interface DraftState {
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    payloadJson: string;
}

const DEFAULT_DRAFT: DraftState = {
    title: '',
    description: '',
    priceCents: 0,
    currency: 'USD',
    payloadJson: '',
};

// One tab per sellable artifact kind, generated from the shared registry
// (label + summary) instead of a hand-maintained copy — this also picks up
// kinds the hand-written list had missed (e.g. privacy_tool).
const TABS: Array<{ id: TabId; label: string; description: string }> = [
    ...CREATOR_ARTIFACT_KINDS.map((kind) => ({
        id: kind as TabId,
        label: ARTIFACT_FORM_REGISTRY[kind].label,
        description: ARTIFACT_FORM_REGISTRY[kind].summary,
    })),
    { id: 'listings', label: 'My listings', description: 'Manage your published artifacts.' },
    { id: 'payouts', label: 'Payouts', description: 'Connect your seller account for payouts.' },
];

function statusBadgeColor(status: CreatorListingView['status']): string {
    switch (status) {
        case 'published':
            return 'var(--accent-primary, #4ECDC4)';
        case 'pending_review':
            return '#d6a700';
        case 'rejected':
            return 'var(--danger, #b3261e)';
        case 'archived':
            return 'var(--text-muted, #888)';
        default:
            return 'var(--text-secondary, #aaa)';
    }
}

const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    width: '100%',
};

export const CreatorStudio: React.FC = () => {
    const [tab, setTab] = useState<TabId>('theme');
    const [providers, setProviders] = useState<CreatorProviderSummary[]>([]);
    const [providerId, setProviderId] = useState<string>('freeblackmarket');
    const [draft, setDraft] = useState<DraftState>(DEFAULT_DRAFT);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [listings, setListings] = useState<CreatorListingView[]>([]);
    const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);

    const token = useMemo(() => readBlackoutApiToken(), []);

    const refreshListings = useCallback(async () => {
        try {
            setListings(await fetchMyListings(token));
        } catch {
            // Non-critical: the listings tab simply stays empty if the fetch
            // fails. Errors that block authoring (provider load, create) surface
            // in the error banner below.
        }
    }, [token]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const list = await fetchCreatorProviders(token);
                if (cancelled) return;
                setProviders(list);
                if (list.length > 0 && !list.find((p) => p.id === providerId)) {
                    setProviderId(list[0].id);
                }
            } catch {
                if (!cancelled) setError('Could not load creator providers.');
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        void refreshListings();
    }, [refreshListings]);

    const submit = useCallback(
        async (kind: CreatorArtifactKind) => {
            setBusy(true);
            setError(null);
            setFeedback(null);
            try {
                let payload: unknown = undefined;
                if (draft.payloadJson.trim().length > 0) {
                    try {
                        payload = JSON.parse(draft.payloadJson);
                    } catch {
                        throw new Error('Artifact payload must be valid JSON.');
                    }
                }
                const body: CreateListingInput = {
                    providerId,
                    artifactKind: kind,
                    category: categoryForArtifact(kind),
                    entitlementKind: entitlementForArtifact(kind),
                    title: draft.title,
                    description: draft.description,
                    priceCents: draft.priceCents,
                    currency: draft.currency,
                    // The server requires an artifactPayload (or an upload id);
                    // default to an empty object for metadata-only drafts rather
                    // than a misleading `{ placeholder: true }` sentinel.
                    artifactPayload: payload ?? {},
                };
                const listing = await createListing(body, token);
                setFeedback(`Listing created (${listing.status}).`);
                setDraft(DEFAULT_DRAFT);
                await refreshListings();
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not create listing.');
            } finally {
                setBusy(false);
            }
        },
        [draft, providerId, refreshListings, token]
    );

    const onPublish = useCallback(
        async (listing: CreatorListingView) => {
            setBusy(true);
            setError(null);
            try {
                await publishListing(listing.id, token);
                await refreshListings();
                setFeedback(`Publish requested for ${listing.title}.`);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Publish failed.');
            } finally {
                setBusy(false);
            }
        },
        [refreshListings, token]
    );

    const onArchive = useCallback(
        async (listing: CreatorListingView) => {
            setBusy(true);
            setError(null);
            try {
                await archiveListing(listing.id, token);
                await refreshListings();
                setFeedback(`Archived ${listing.title}.`);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Archive failed.');
            } finally {
                setBusy(false);
            }
        },
        [refreshListings, token]
    );

    const onStartOnboarding = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const handle = await startPayoutOnboarding(providerId, window.location.href, token);
            setOnboardingUrl(handle.onboardingUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Onboarding failed.');
        } finally {
            setBusy(false);
        }
    }, [providerId, token]);

    const renderDraftForm = (kind: CreatorArtifactKind, payloadHint: string) => (
        <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Title</span>
                <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                    style={inputStyle}
                />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Description</span>
                <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ flex: 1, display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Price (cents)
                    </span>
                    <input
                        type="number"
                        min={0}
                        value={draft.priceCents}
                        onChange={(e) =>
                            setDraft((prev) => ({
                                ...prev,
                                priceCents: Number.parseInt(e.target.value, 10) || 0,
                            }))
                        }
                        style={inputStyle}
                    />
                </label>
                <label style={{ width: 140, display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Currency</span>
                    <input
                        type="text"
                        value={draft.currency}
                        onChange={(e) =>
                            setDraft((prev) => ({ ...prev, currency: e.target.value }))
                        }
                        style={inputStyle}
                    />
                </label>
            </div>
            <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Artifact payload (JSON) — {payloadHint}
                </span>
                <textarea
                    value={draft.payloadJson}
                    onChange={(e) => setDraft((prev) => ({ ...prev, payloadJson: e.target.value }))}
                    rows={6}
                    placeholder='{"...": "..."}'
                    style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
                />
            </label>
            <button
                type="button"
                disabled={busy}
                onClick={() => void submit(kind)}
                style={{ width: 'fit-content' }}
            >
                {busy ? 'Submitting…' : 'Create draft listing'}
            </button>
        </div>
    );

    const tabContent = (() => {
        // Every artifact tab renders the same raw-JSON draft form; the payload
        // hint comes from the shared registry (see payloadHintFor) so the
        // per-kind shapes live in exactly one place.
        if (tab !== 'listings' && tab !== 'payouts') {
            return renderDraftForm(tab, payloadHintFor(tab));
        }
        switch (tab) {
            case 'listings':
                return (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {listings.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)' }}>
                                No listings yet. Create one from the artifact tabs.
                            </p>
                        ) : (
                            listings.map((listing) => (
                                <div
                                    key={listing.id}
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        padding: 10,
                                        display: 'grid',
                                        gap: 4,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        <strong>{listing.title}</strong>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                padding: '2px 6px',
                                                borderRadius: 999,
                                                background: statusBadgeColor(listing.status),
                                                color: '#fff',
                                            }}
                                        >
                                            {listing.status}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            {listing.artifactKind}
                                        </span>
                                    </div>
                                    <small style={{ color: 'var(--text-secondary)' }}>
                                        {listing.providerId} ·{' '}
                                        {(listing.priceCents / 100).toFixed(2)} {listing.currency}
                                    </small>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            type="button"
                                            disabled={
                                                busy ||
                                                listing.status === 'published' ||
                                                listing.status === 'archived'
                                            }
                                            onClick={() => void onPublish(listing)}
                                        >
                                            Publish
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void onArchive(listing)}
                                        >
                                            Archive
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                );
            case 'payouts':
                return (
                    <div style={{ display: 'grid', gap: 8 }}>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            Connect your marketplace seller account to receive payouts. The host
                            marketplace handles KYC and payout schedules.
                        </p>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onStartOnboarding()}
                            style={{ width: 'fit-content' }}
                        >
                            Start payout onboarding
                        </button>
                        {onboardingUrl ? (
                            <p style={{ fontSize: 12 }}>
                                Onboarding URL ready —{' '}
                                <a href={onboardingUrl} target="_blank" rel="noopener noreferrer">
                                    open in browser
                                </a>
                                .
                            </p>
                        ) : null}
                    </div>
                );
        }
    })();

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header>
                <h3 style={{ marginBottom: 4 }}>Creator Studio</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Author and publish themes, manifest plugins, code plugins, and asset packs to a
                    connected marketplace.
                </p>
            </header>

            <label style={{ display: 'grid', gap: 4, maxWidth: 320 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Provider</span>
                <select
                    value={providerId}
                    onChange={(event) => setProviderId(event.target.value)}
                    style={inputStyle}
                >
                    {providers.length === 0 ? (
                        <option value={providerId}>{providerId}</option>
                    ) : (
                        providers.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.displayName}
                            </option>
                        ))
                    )}
                </select>
            </label>

            <div
                role="tablist"
                aria-label="Creator Studio sections"
                style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
            >
                {TABS.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === entry.id}
                        onClick={() => setTab(entry.id)}
                        style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: '1px solid var(--border-default)',
                            background:
                                tab === entry.id
                                    ? 'var(--accent-primary, #4ECDC4)'
                                    : 'var(--bg-surface)',
                            color: tab === entry.id ? 'var(--bg-surface)' : 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: 12,
                        }}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}>
                {TABS.find((entry) => entry.id === tab)?.description}
            </p>

            {error ? (
                <div
                    style={{
                        background: 'var(--bg-danger)',
                        color: 'var(--text-on-danger)',
                        padding: 8,
                        borderRadius: 8,
                        fontSize: 13,
                    }}
                >
                    {error}
                </div>
            ) : null}
            {feedback ? <small style={{ color: 'var(--text-secondary)' }}>{feedback}</small> : null}

            <div
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    padding: 12,
                }}
            >
                {tabContent}
            </div>
        </section>
    );
};

export default CreatorStudio;
