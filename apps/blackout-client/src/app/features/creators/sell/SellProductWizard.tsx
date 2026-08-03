import React, { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { FeatureGuide } from '../../../components/feature-guide/FeatureGuide';
import {
    createCreatorListing,
    fetchCreatorProviders,
    publishCreatorListing,
    startCreatorPayoutOnboarding,
    type CreatorListingView,
    type CreatorProviderSummary,
} from '../creatorClient';
import {
    getSellTemplate,
    listSellTemplates,
    type ArtifactFormDescriptor,
} from './artifactFormRegistry';
import { ArtifactPayloadForm } from './ArtifactPayloadForm';
import { MediaUploadField } from './MediaUploadField';

/**
 * Guided "sell a digital product on the black market" flow. Walks a seller from
 * choosing what they're selling through authoring the artifact, adding preview
 * media, and creating + publishing the listing — replacing the raw-JSON authoring
 * in Creator Studio for the common cases. All steps hit the same `/v1/creator`
 * API; see `docs/guides/selling-on-the-black-market.md`.
 */
type WizardStep = 'choose' | 'details' | 'artifact' | 'media' | 'review';

interface DetailsState {
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    tagsText: string;
    providerId: string;
}

const DEFAULT_DETAILS: DetailsState = {
    title: '',
    description: '',
    priceCents: 0,
    currency: 'USD',
    tagsText: '',
    providerId: 'freeblackmarket',
};

const STEP_ORDER: WizardStep[] = ['choose', 'details', 'artifact', 'media', 'review'];
const STEP_LABELS: Record<WizardStep, string> = {
    choose: 'What are you selling?',
    details: 'Details',
    artifact: 'Build the artifact',
    media: 'Preview media',
    review: 'Review & create',
};

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};
const bodyStyle: CSSProperties = {
    display: 'grid',
    gap: 12,
    padding: '12px 16px 24px',
    maxWidth: 720,
};
const inputStyle: CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    width: '100%',
};
const labelStyle: CSSProperties = { display: 'grid', gap: 4 };
const labelTextStyle: CSSProperties = { fontSize: 12, color: 'var(--text-secondary, #aaa)' };
const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    textAlign: 'left',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #111827)',
    color: 'inherit',
    cursor: 'pointer',
};
const primaryButton: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--accent-primary, #4ECDC4)',
    background: 'var(--accent-primary, #4ECDC4)',
    color: 'var(--bg-surface, #0f172a)',
    fontWeight: 600,
    cursor: 'pointer',
};
const ghostButton: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
};

function statusColor(status: CreatorListingView['status']): string {
    switch (status) {
        case 'published':
            return 'var(--accent-primary, #4ECDC4)';
        case 'pending_review':
            return '#d6a700';
        case 'rejected':
            return 'var(--danger, #b3261e)';
        default:
            return 'var(--text-secondary, #aaa)';
    }
}

export const SellProductWizard: React.FC = () => {
    const [step, setStep] = useState<WizardStep>('choose');
    const [templateId, setTemplateId] = useState<string | null>(null);
    const [payloadValues, setPayloadValues] = useState<Record<string, unknown>>({});
    const [details, setDetails] = useState<DetailsState>(DEFAULT_DETAILS);
    const [mediaUrls, setMediaUrls] = useState<string[]>([]);
    const [providers, setProviders] = useState<CreatorProviderSummary[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatorListingView | null>(null);
    const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);

    const templates = useMemo(() => listSellTemplates(), []);
    const descriptor: ArtifactFormDescriptor | undefined = templateId
        ? getSellTemplate(templateId)
        : undefined;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { providers: list } = await fetchCreatorProviders();
                if (cancelled) return;
                setProviders(list);
                if (list.length > 0 && !list.find((p) => p.id === DEFAULT_DETAILS.providerId)) {
                    setDetails((prev) => ({ ...prev, providerId: list[0].id }));
                }
            } catch {
                // Non-fatal: keep the default provider id; create will surface any error.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const chooseTemplate = useCallback((tpl: ArtifactFormDescriptor) => {
        setTemplateId(tpl.id);
        setPayloadValues({ ...tpl.defaults });
        setError(null);
        setStep('details');
    }, []);

    const setPayloadValue = useCallback((key: string, value: unknown) => {
        setPayloadValues((prev) => ({ ...prev, [key]: value }));
    }, []);

    const goNext = useCallback(() => {
        setError(null);
        if (step === 'details') {
            if (!details.title.trim() || !details.description.trim()) {
                setError('Title and description are required.');
                return;
            }
        }
        const index = STEP_ORDER.indexOf(step);
        if (index < STEP_ORDER.length - 1) setStep(STEP_ORDER[index + 1]);
    }, [step, details]);

    const goBack = useCallback(() => {
        setError(null);
        const index = STEP_ORDER.indexOf(step);
        if (index > 0) setStep(STEP_ORDER[index - 1]);
    }, [step]);

    const handleCreate = useCallback(async () => {
        if (!descriptor) return;
        setBusy(true);
        setError(null);
        try {
            let artifactPayload: unknown;
            try {
                artifactPayload = descriptor.buildPayload(payloadValues);
            } catch {
                setBusy(false);
                setError('The artifact payload is not valid — check any JSON fields.');
                return;
            }
            const tags = details.tagsText
                .split(/[\s,]+/)
                .map((t) => t.trim())
                .filter(Boolean);
            const { listing } = await createCreatorListing({
                providerId: details.providerId,
                artifactKind: descriptor.kind,
                category: descriptor.category,
                entitlementKind: descriptor.entitlementKind,
                title: details.title.trim(),
                description: details.description.trim(),
                priceCents: details.priceCents,
                currency: details.currency.trim() || 'USD',
                tags: tags.length > 0 ? tags : undefined,
                mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
                artifactPayload,
            });
            setCreated(listing);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the listing.');
        } finally {
            setBusy(false);
        }
    }, [descriptor, payloadValues, details, mediaUrls]);

    const handlePublish = useCallback(async () => {
        if (!created) return;
        setBusy(true);
        setError(null);
        try {
            const { listing } = await publishCreatorListing(created.id);
            if (listing) setCreated(listing);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Publish failed.');
        } finally {
            setBusy(false);
        }
    }, [created]);

    const handleOnboarding = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const handle = await startCreatorPayoutOnboarding(
                details.providerId,
                window.location.href
            );
            setOnboardingUrl(handle.onboardingUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start payout onboarding.');
        } finally {
            setBusy(false);
        }
    }, [details.providerId]);

    const resetAll = useCallback(() => {
        setStep('choose');
        setTemplateId(null);
        setPayloadValues({});
        setDetails(DEFAULT_DETAILS);
        setMediaUrls([]);
        setCreated(null);
        setOnboardingUrl(null);
        setError(null);
    }, []);

    const blackoutTemplates = templates.filter((t) => t.audience === 'blackout-feature');
    const digitalTemplates = templates.filter((t) => t.audience === 'digital-download');

    return (
        <section style={layoutStyle} data-testid="sell-product-wizard">
            <FeatureGuide>
                Post a digital product to the black market. <strong>Blackout products</strong>{' '}
                (themes, plugins, cosmetics, tools) unlock features inside the app; a{' '}
                <strong>digital download</strong> is a plain file delivered to the buyer. Both are
                listed here and sold through the connected marketplace.
            </FeatureGuide>
            <header style={{ padding: '16px 20px 4px' }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Sell a digital product</h1>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted, #9ca3af)', fontSize: 13 }}>
                    Step {STEP_ORDER.indexOf(step) + 1} of {STEP_ORDER.length} — {STEP_LABELS[step]}
                </p>
            </header>

            <div style={bodyStyle}>
                {error ? (
                    <div
                        style={{
                            background: 'var(--bg-danger, #3b0d0c)',
                            color: 'var(--text-on-danger, #fff)',
                            padding: 8,
                            borderRadius: 8,
                            fontSize: 13,
                        }}
                    >
                        {error}
                    </div>
                ) : null}

                {step === 'choose' && (
                    <div style={{ display: 'grid', gap: 16 }}>
                        <div style={{ display: 'grid', gap: 8 }}>
                            <h2 style={{ margin: 0, fontSize: 15 }}>Digital goods</h2>
                            {digitalTemplates.map((tpl) => (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    style={cardStyle}
                                    data-testid={`sell-template-${tpl.id}`}
                                    onClick={() => chooseTemplate(tpl)}
                                >
                                    <strong>{tpl.label}</strong>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {tpl.summary}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                            <h2 style={{ margin: 0, fontSize: 15 }}>Blackout features</h2>
                            {blackoutTemplates.map((tpl) => (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    style={cardStyle}
                                    data-testid={`sell-template-${tpl.id}`}
                                    onClick={() => chooseTemplate(tpl)}
                                >
                                    <strong>{tpl.label}</strong>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {tpl.summary}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'details' && descriptor && (
                    <div style={{ display: 'grid', gap: 10 }}>
                        <label style={labelStyle}>
                            <span style={labelTextStyle}>Title *</span>
                            <input
                                style={inputStyle}
                                type="text"
                                value={details.title}
                                data-testid="sell-title"
                                onChange={(e) =>
                                    setDetails((p) => ({ ...p, title: e.target.value }))
                                }
                            />
                        </label>
                        <label style={labelStyle}>
                            <span style={labelTextStyle}>Description *</span>
                            <textarea
                                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                                rows={3}
                                value={details.description}
                                data-testid="sell-description"
                                onChange={(e) =>
                                    setDetails((p) => ({ ...p, description: e.target.value }))
                                }
                            />
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <label style={{ ...labelStyle, flex: 1 }}>
                                <span style={labelTextStyle}>Price (cents)</span>
                                <input
                                    style={inputStyle}
                                    type="number"
                                    min={0}
                                    value={details.priceCents}
                                    data-testid="sell-price"
                                    onChange={(e) =>
                                        setDetails((p) => ({
                                            ...p,
                                            priceCents: Number.parseInt(e.target.value, 10) || 0,
                                        }))
                                    }
                                />
                            </label>
                            <label style={{ ...labelStyle, width: 120 }}>
                                <span style={labelTextStyle}>Currency</span>
                                <input
                                    style={inputStyle}
                                    type="text"
                                    value={details.currency}
                                    onChange={(e) =>
                                        setDetails((p) => ({ ...p, currency: e.target.value }))
                                    }
                                />
                            </label>
                        </div>
                        <label style={labelStyle}>
                            <span style={labelTextStyle}>Tags (comma-separated)</span>
                            <input
                                style={inputStyle}
                                type="text"
                                value={details.tagsText}
                                placeholder="privacy, tool"
                                onChange={(e) =>
                                    setDetails((p) => ({ ...p, tagsText: e.target.value }))
                                }
                            />
                        </label>
                        <label style={labelStyle}>
                            <span style={labelTextStyle}>Marketplace</span>
                            <select
                                style={inputStyle}
                                value={details.providerId}
                                onChange={(e) =>
                                    setDetails((p) => ({ ...p, providerId: e.target.value }))
                                }
                            >
                                {providers.length === 0 ? (
                                    <option value={details.providerId}>{details.providerId}</option>
                                ) : (
                                    providers.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.displayName}
                                        </option>
                                    ))
                                )}
                            </select>
                        </label>
                    </div>
                )}

                {step === 'artifact' && descriptor && (
                    <ArtifactPayloadForm
                        descriptor={descriptor}
                        values={payloadValues}
                        onChange={setPayloadValue}
                    />
                )}

                {step === 'media' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                            Add preview images buyers see on the listing (optional). The sellable
                            file itself is delivered by the marketplace after purchase, not uploaded
                            here.
                        </p>
                        <MediaUploadField value={mediaUrls} onChange={setMediaUrls} />
                    </div>
                )}

                {step === 'review' && descriptor && !created && (
                    <div style={{ display: 'grid', gap: 8 }}>
                        <h2 style={{ margin: 0, fontSize: 15 }}>Review</h2>
                        <dl
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'auto 1fr',
                                gap: '4px 12px',
                                fontSize: 13,
                            }}
                        >
                            <dt style={labelTextStyle}>Type</dt>
                            <dd style={{ margin: 0 }}>{descriptor.label}</dd>
                            <dt style={labelTextStyle}>Title</dt>
                            <dd style={{ margin: 0 }}>{details.title}</dd>
                            <dt style={labelTextStyle}>Price</dt>
                            <dd style={{ margin: 0 }}>
                                {(details.priceCents / 100).toFixed(2)} {details.currency}
                            </dd>
                            <dt style={labelTextStyle}>Marketplace</dt>
                            <dd style={{ margin: 0 }}>{details.providerId}</dd>
                            <dt style={labelTextStyle}>Preview images</dt>
                            <dd style={{ margin: 0 }}>{mediaUrls.length}</dd>
                        </dl>
                    </div>
                )}

                {created && (
                    <div style={{ display: 'grid', gap: 8 }}>
                        <p style={{ margin: 0 }}>
                            Listing created: <strong>{created.title}</strong>{' '}
                            <span
                                style={{
                                    fontSize: 11,
                                    padding: '2px 6px',
                                    borderRadius: 999,
                                    background: statusColor(created.status),
                                    color: '#fff',
                                }}
                            >
                                {created.status}
                            </span>
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                style={primaryButton}
                                disabled={
                                    busy ||
                                    created.status === 'published' ||
                                    created.status === 'pending_review'
                                }
                                onClick={() => void handlePublish()}
                                data-testid="sell-publish"
                            >
                                Publish
                            </button>
                            <button
                                type="button"
                                style={ghostButton}
                                disabled={busy}
                                onClick={() => void handleOnboarding()}
                            >
                                Set up payouts
                            </button>
                            <button type="button" style={ghostButton} onClick={resetAll}>
                                List another
                            </button>
                        </div>
                        {onboardingUrl ? (
                            <small>
                                Payout onboarding ready —{' '}
                                <a href={onboardingUrl} target="_blank" rel="noopener noreferrer">
                                    open in browser
                                </a>
                                .
                            </small>
                        ) : null}
                    </div>
                )}

                {!created && step !== 'choose' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                            type="button"
                            style={ghostButton}
                            onClick={goBack}
                            data-testid="sell-back"
                        >
                            Back
                        </button>
                        {step === 'review' ? (
                            <button
                                type="button"
                                style={primaryButton}
                                disabled={busy}
                                onClick={() => void handleCreate()}
                                data-testid="sell-create"
                            >
                                {busy ? 'Creating…' : 'Create listing'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                style={primaryButton}
                                onClick={goNext}
                                data-testid="sell-next"
                            >
                                Next
                            </button>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};

export default SellProductWizard;
