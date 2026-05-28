import React, { type CSSProperties, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import { CREATOR_KITS, type CreatorKit } from '../kits/kitCatalog';
import { ownedTemplateKitsAtom } from '../kits/ownedTemplatesAtom';
import {
    applyCreatorKit,
    kitAppliedStorageKey,
    type ApplyStepResult,
} from '../kits/applyKit';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { HubSection, hubCardStyle, hubGridStyle } from '../components/HubSection';

const kitCardStyle = (active: boolean): CSSProperties => ({
    ...hubCardStyle,
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    borderColor: active ? 'var(--accent-primary, #2EF2C5)' : 'var(--border-default, #374151)',
});

const glyphStyle: CSSProperties = { fontSize: 28, lineHeight: 1 };
const kitNameStyle: CSSProperties = { fontSize: 15, fontWeight: 700 };
const kitTaglineStyle: CSSProperties = { fontSize: 12, color: 'var(--text-muted, #9ca3af)' };

const detailStyle: CSSProperties = {
    marginTop: 16,
    padding: 16,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
};

const groupTitleStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
    margin: '0 0 4px',
};

const listStyle: CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 };

const linkRowStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };

const linkStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #2EF2C5)',
    color: 'var(--accent-primary, #2EF2C5)',
    background: 'transparent',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
};

const applyPanelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface, #0b1220)',
};

const applyButtonStyle: CSSProperties = {
    alignSelf: 'flex-start',
    padding: '8px 16px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--accent-primary, #2EF2C5)',
    color: '#06231d',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
    padding: '8px 16px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'transparent',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const warnStyle: CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: 'var(--warning, #f6b73c)',
};

const statusGlyph: Record<ApplyStepResult['status'], string> = {
    ok: '✓',
    skipped: '–',
    error: '✗',
};

/** Human-readable preview of what applying a kit will provision. */
const describeApply = (kit: CreatorKit): string[] => {
    const spec = kit.apply;
    if (!spec) return [];
    const lines: string[] = [];
    if (spec.profile?.status) lines.push(`Set profile status to “${spec.profile.status.text}”`);
    for (const den of spec.dens ?? []) lines.push(`Create ${den.kind ?? 'private'} den “${den.name}”`);
    for (const tier of spec.tiers ?? [])
        lines.push(`Create subscription tier “${tier.name}”`);
    for (const pool of spec.aidPools ?? []) lines.push(`Create aid pool “${pool.title}”`);
    return lines;
};

type ApplyPhase = 'idle' | 'confirm' | 'running' | 'done';

/**
 * One-click apply for a kit. Gated behind an explicit confirmation that lists
 * exactly what will be created; re-applying is allowed but warns (it creates
 * duplicates). Secret-minting stream tooling stays in the deep-links.
 */
const KitApplyPanel = ({ kit }: { kit: CreatorKit }): JSX.Element | null => {
    const mx = useMatrixClientOrNull();
    const userId = mx?.getSafeUserId() ?? null;
    const [phase, setPhase] = useState<ApplyPhase>('idle');
    const [results, setResults] = useState<ApplyStepResult[]>([]);
    const [appliedBefore, setAppliedBefore] = useState(false);

    if (!kit.apply) return null;
    const actions = describeApply(kit);
    if (actions.length === 0) return null;

    const canApply = !!mx && !!userId;

    const openConfirm = (): void => {
        try {
            setAppliedBefore(localStorage.getItem(kitAppliedStorageKey(kit.id)) !== null);
        } catch {
            setAppliedBefore(false);
        }
        setPhase('confirm');
    };

    const runApply = (): void => {
        if (!mx || !userId) return;
        setPhase('running');
        applyCreatorKit(kit, { mx, userId })
            .then((res) => {
                setResults(res);
                setPhase('done');
                try {
                    localStorage.setItem(kitAppliedStorageKey(kit.id), new Date().toISOString());
                } catch {
                    /* storage unavailable — non-fatal */
                }
            })
            .catch((err: unknown) => {
                setResults([
                    {
                        area: 'profile',
                        label: 'Apply failed',
                        status: 'error',
                        detail: err instanceof Error ? err.message : undefined,
                    },
                ]);
                setPhase('done');
            });
    };

    return (
        <div style={applyPanelStyle} data-testid="creator-kit-apply-panel">
            {phase === 'idle' ? (
                <>
                    <button
                        type="button"
                        style={applyButtonStyle}
                        onClick={openConfirm}
                        disabled={!canApply}
                        data-testid="creator-kit-apply"
                    >
                        Apply this kit
                    </button>
                    {!canApply ? (
                        <p style={warnStyle}>Sign in to apply this kit to your account.</p>
                    ) : null}
                </>
            ) : null}

            {phase === 'confirm' ? (
                <div data-testid="creator-kit-apply-confirm-panel">
                    <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
                        Applying “{kit.name}” will:
                    </p>
                    <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                        {actions.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                    {appliedBefore ? (
                        <p style={warnStyle} data-testid="creator-kit-apply-reapply-warning">
                            You applied this kit before — re-applying creates duplicates.
                        </p>
                    ) : null}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                            type="button"
                            style={applyButtonStyle}
                            onClick={runApply}
                            data-testid="creator-kit-apply-confirm"
                        >
                            Confirm &amp; apply
                        </button>
                        <button
                            type="button"
                            style={secondaryButtonStyle}
                            onClick={() => setPhase('idle')}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : null}

            {phase === 'running' ? <p style={{ margin: 0, fontSize: 13 }}>Applying…</p> : null}

            {phase === 'done' ? (
                <div data-testid="creator-kit-apply-results">
                    <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Results</p>
                    <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                        {results.map((step) => (
                            <li key={`${step.area}:${step.label}`} data-step-status={step.status}>
                                {statusGlyph[step.status]} {step.label}
                                {step.status === 'skipped' ? ' (not available on your account)' : ''}
                                {step.status === 'error' && step.detail ? ` — ${step.detail}` : ''}
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={() => setPhase('idle')}
                    >
                        Done
                    </button>
                </div>
            ) : null}
        </div>
    );
};

const ConfigGroup = ({ title, items }: { title: string; items: string[] }): JSX.Element => (
    <div>
        <p style={groupTitleStyle}>{title}</p>
        <ul style={listStyle}>
            {items.map((item) => (
                <li key={item}>{item}</li>
            ))}
        </ul>
    </div>
);

const KitDetail = ({ kit }: { kit: CreatorKit }): JSX.Element => (
    <div style={detailStyle} data-testid="creator-kit-detail" data-kit-id={kit.id}>
        <strong style={{ fontSize: 16 }}>
            {kit.glyph} {kit.name}
        </strong>
        <div style={hubGridStyle}>
            <ConfigGroup title="Profile" items={kit.configures.profile} />
            <ConfigGroup title="Dens" items={kit.configures.dens} />
            <ConfigGroup title="Monetization" items={kit.configures.monetization} />
            <ConfigGroup title="Stream tools" items={kit.configures.streamTools} />
        </div>
        <KitApplyPanel kit={kit} />
        <div style={linkRowStyle}>
            {kit.deepLinks.map((link) => (
                <Link
                    key={link.to + link.label}
                    to={link.to}
                    style={linkStyle}
                    data-testid="creator-kit-deeplink"
                >
                    {link.label} ↗
                </Link>
            ))}
        </div>
    </div>
);

/**
 * Creator Kits catalog. Selecting a kit reveals what it configures plus
 * deep-links into the underlying surfaces (profile, events, monetization,
 * listings) so a creator can set it up. One-click apply is intentionally
 * deferred — see kitCatalog.ts.
 */
export const CreatorKits = (): JSX.Element => {
    const ownedTemplateKits = useAtomValue(ownedTemplateKitsAtom);
    const kits = useMemo(
        () => [...CREATOR_KITS, ...ownedTemplateKits],
        [ownedTemplateKits]
    );
    const [selectedKitId, setSelectedKitId] = useState<string | null>(CREATOR_KITS[0]?.id ?? null);
    const selectedKit = kits.find((kit) => kit.id === selectedKitId) ?? null;

    return (
        <HubSection
            title="Creator Kits"
            subtitle="Install-ready presets that configure your profile, dens, monetization, and stream tools for a workflow."
            testId="creator-kits"
            shellRegion="creator-kits"
        >
            <div style={hubGridStyle} data-testid="creator-kits-grid">
                {kits.map((kit) => (
                    <button
                        key={kit.id}
                        type="button"
                        style={kitCardStyle(kit.id === selectedKitId)}
                        onClick={() => setSelectedKitId(kit.id)}
                        data-testid="creator-kit-card"
                        data-kit-id={kit.id}
                        aria-pressed={kit.id === selectedKitId}
                    >
                        <span style={glyphStyle} aria-hidden="true">
                            {kit.glyph}
                        </span>
                        <span style={kitNameStyle}>{kit.name}</span>
                        <span style={kitTaglineStyle}>{kit.tagline}</span>
                    </button>
                ))}
            </div>
            {selectedKit ? <KitDetail kit={selectedKit} /> : null}
        </HubSection>
    );
};

export default CreatorKits;
