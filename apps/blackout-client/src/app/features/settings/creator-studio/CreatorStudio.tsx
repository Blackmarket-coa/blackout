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

type TabId = CreatorArtifactKind | 'listings' | 'payouts';

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

const TABS: Array<{ id: TabId; label: string; description: string }> = [
    {
        id: 'theme',
        label: 'Theme pack',
        description: 'Palette + token bundle. Reuses the customization bundle format.',
    },
    {
        id: 'manifest_plugin',
        label: 'Manifest plugin',
        description: 'Declarative-only feature plugin. No JavaScript executes.',
    },
    {
        id: 'code_plugin',
        label: 'Code plugin',
        description: 'Sandboxed JavaScript bundle running in a worker boundary.',
    },
    {
        id: 'asset_bundle',
        label: 'Asset bundle',
        description: 'Emoji, sticker, or meme assets exposed as an entitlement pack.',
    },
    {
        id: 'profile_cosmetic',
        label: 'Profile cosmetic',
        description: 'Avatar decoration, nameplate, profile effect, or collectible badge.',
    },
    {
        id: 'sound_pack',
        label: 'Sound pack',
        description: 'Soundboard clips, notification sounds, or voice-filter presets.',
    },
    {
        id: 'community_template',
        label: 'Community template',
        description: 'Den layout, role + permission bundle, or moderation rule pack.',
    },
    {
        id: 'stream_asset',
        label: 'Stream asset',
        description: 'Overlay pack, alert pack, channel-point reward kit, or badge set.',
    },
    {
        id: 'vault_item',
        label: 'Security item',
        description: 'Encrypted vault slot/template or privacy toolkit.',
    },
    {
        id: 'ai_persona',
        label: 'AI persona',
        description: 'AI persona or prompt pack, confined to AI dens.',
    },
    {
        id: 'automation_recipe',
        label: 'Automation recipe',
        description: 'Declarative trigger/action automation.',
    },
    { id: 'listings', label: 'My listings', description: 'Manage your published artifacts.' },
    { id: 'payouts', label: 'Payouts', description: 'Connect your seller account for payouts.' },
];

function categoryFor(kind: CreatorArtifactKind): string {
    switch (kind) {
        case 'theme':
            return 'plugin-curated';
        case 'manifest_plugin':
        case 'code_plugin':
            return 'plugin-curated';
        case 'asset_bundle':
            return 'emoji-sticker';
        case 'profile_cosmetic':
            return 'profile-cosmetic';
        case 'sound_pack':
            return 'audio-pack';
        case 'community_template':
            return 'community-template';
        case 'stream_asset':
            return 'creator-asset';
        case 'vault_item':
            return 'security-tool';
        case 'ai_persona':
        case 'automation_recipe':
            return 'ai-automation';
    }
}

function entitlementFor(kind: CreatorArtifactKind): string {
    switch (kind) {
        case 'theme':
        case 'manifest_plugin':
            return 'plugin_flag';
        case 'code_plugin':
            return 'software_license';
        case 'asset_bundle':
            return 'asset_bundle';
        case 'profile_cosmetic':
            return 'profile_cosmetic';
        case 'sound_pack':
            return 'sound_pack';
        case 'community_template':
            return 'community_template';
        case 'stream_asset':
            return 'stream_asset';
        case 'vault_item':
            return 'vault_item';
        case 'ai_persona':
        case 'automation_recipe':
            return 'plugin_flag';
    }
}

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
        } catch (err) {
            console.warn('[creator-studio] failed to load listings', err);
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
            } catch (err) {
                if (!cancelled) setError('Could not load creator providers.');
                console.warn('[creator-studio] providers failed', err);
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
                    category: categoryFor(kind),
                    entitlementKind: entitlementFor(kind),
                    title: draft.title,
                    description: draft.description,
                    priceCents: draft.priceCents,
                    currency: draft.currency,
                    artifactPayload: payload ?? { placeholder: true },
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
            const handle = await startPayoutOnboarding(
                providerId,
                window.location.href,
                token
            );
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
                    onChange={(e) =>
                        setDraft((prev) => ({ ...prev, description: e.target.value }))
                    }
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
                    onChange={(e) =>
                        setDraft((prev) => ({ ...prev, payloadJson: e.target.value }))
                    }
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
        switch (tab) {
            case 'theme':
                return renderDraftForm(
                    'theme',
                    'Paste a serialized BlackoutCustomizationBundle.'
                );
            case 'manifest_plugin':
                return renderDraftForm(
                    'manifest_plugin',
                    'A FeatureCustomizationManifest object (no JS).'
                );
            case 'code_plugin':
                return renderDraftForm(
                    'code_plugin',
                    'Object with { manifest, bundleBase64, sha256 } — runs in the sandbox.'
                );
            case 'asset_bundle':
                return renderDraftForm(
                    'asset_bundle',
                    'Object with { files: [{ name, mime, base64 }] }.'
                );
            case 'profile_cosmetic':
                return renderDraftForm(
                    'profile_cosmetic',
                    'Object with { cosmeticType: avatar_decoration|nameplate|profile_effect|badge, ... }.'
                );
            case 'sound_pack':
                return renderDraftForm(
                    'sound_pack',
                    'Object with { soundKind: soundboard|notification|voice_filter, ... }.'
                );
            case 'community_template':
                return renderDraftForm(
                    'community_template',
                    'Object with { template: { dens, roles, moderation, onboarding } }.'
                );
            case 'stream_asset':
                return renderDraftForm(
                    'stream_asset',
                    'Object with { assetType: overlay|alert|channel_point_kit|badge_set, ... }.'
                );
            case 'vault_item':
                return renderDraftForm(
                    'vault_item',
                    'Object with { vaultKind: slot|template, ... }.'
                );
            case 'ai_persona':
                return renderDraftForm(
                    'ai_persona',
                    'Object with { persona: { name, systemPrompt } }. AI-den only.'
                );
            case 'automation_recipe':
                return renderDraftForm(
                    'automation_recipe',
                    'Object with { triggers: [...], actions: [...] }.'
                );
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
                                        {(listing.priceCents / 100).toFixed(2)}{' '}
                                        {listing.currency}
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
                            Connect your marketplace seller account to receive payouts. The
                            host marketplace handles KYC and payout schedules.
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
                                <a
                                    href={onboardingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
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
                    Author and publish themes, manifest plugins, code plugins, and asset
                    packs to a connected marketplace.
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
                            color:
                                tab === entry.id
                                    ? 'var(--bg-surface)'
                                    : 'var(--text-primary)',
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
            {feedback ? (
                <small style={{ color: 'var(--text-secondary)' }}>{feedback}</small>
            ) : null}

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
