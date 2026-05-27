import { useEffect, useMemo, useState } from 'react';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { CREATOR_KITS } from '../../streaming/kits/kitCatalog';
import { applyCreatorKit, type ApplyStepResult } from '../../streaming/kits/applyKit';
import { suggestKitForArchetypes } from '../creatorArchetypes';
import { trackCreatorKitSelected } from '../creatorOnboardingTelemetry';
import {
    accentButton,
    cardStyle,
    chipRow,
    chipStyle,
    errorStyle,
    ghostButton,
    stepDescStyle,
    stepLabelStyle,
    stepTitleStyle,
    type CreatorStepProps,
} from '../creatorOnboardingStyles';

const STATUS_GLYPH: Record<ApplyStepResult['status'], string> = {
    ok: '✓',
    skipped: '–',
    error: '✗',
};

/**
 * Step 7 — Creator Kit Installation. Pre-highlights the kit suggested by the
 * chosen archetypes and one-click applies it (profile, dens, tiers, aid pools)
 * via `applyCreatorKit`, reusing existing mutation clients (no new backend).
 */
export const KitInstallStep = ({ draft, patch }: CreatorStepProps): JSX.Element => {
    const mx = useMatrixClientOrNull();
    const userId = mx?.getSafeUserId() ?? null;
    const suggested = useMemo(
        () => suggestKitForArchetypes(draft.selectedArchetypes),
        [draft.selectedArchetypes]
    );
    const [selectedKitId, setSelectedKitId] = useState(draft.installedKitId ?? suggested);
    const [results, setResults] = useState<ApplyStepResult[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!draft.installedKitId) setSelectedKitId(suggested);
    }, [draft.installedKitId, suggested]);

    const selectedKit = CREATOR_KITS.find((kit) => kit.id === selectedKitId) ?? CREATOR_KITS[0];

    const apply = async () => {
        if (!mx || !userId || !selectedKit) {
            setError('Sign in to apply this kit to your account.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const stepResults = await applyCreatorKit(selectedKit, { mx, userId });
            setResults(stepResults);
            trackCreatorKitSelected(selectedKit.id);
            patch({ installedKitId: selectedKit.id });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'kit apply failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <article style={cardStyle} data-testid="creator-step-kit">
            <span style={stepLabelStyle}>Step 7 · Creator kit</span>
            <span style={stepTitleStyle}>Install a kit to skip the setup</span>
            <span style={stepDescStyle}>
                A kit configures your profile, dens, and monetization in one step. We suggested one
                based on your archetypes — switch if you’d like.
            </span>
            <div style={chipRow} role="group" aria-label="Creator kits">
                {CREATOR_KITS.map((kit) => {
                    const active = kit.id === selectedKitId;
                    return (
                        <button
                            key={kit.id}
                            type="button"
                            style={chipStyle(active)}
                            aria-pressed={active}
                            onClick={() => setSelectedKitId(kit.id)}
                            data-testid="creator-kit-option"
                            data-kit-id={kit.id}
                            data-suggested={kit.id === suggested ? 'true' : 'false'}
                        >
                            <span aria-hidden="true">{kit.glyph}</span>
                            {kit.name}
                            {kit.id === suggested ? ' ★' : ''}
                        </button>
                    );
                })}
            </div>
            {selectedKit ? (
                <span style={stepDescStyle}>{selectedKit.tagline}</span>
            ) : null}
            {error ? (
                <p style={errorStyle} data-testid="creator-kit-error">
                    {error}
                </p>
            ) : null}
            <button
                type="button"
                style={draft.installedKitId ? ghostButton : accentButton}
                disabled={busy}
                onClick={() => void apply()}
                data-testid="creator-kit-apply"
            >
                {busy
                    ? 'Applying…'
                    : draft.installedKitId
                      ? 'Apply again'
                      : `Install ${selectedKit?.name ?? 'kit'}`}
            </button>
            {results.length > 0 ? (
                <ul
                    style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}
                    data-testid="creator-kit-results"
                >
                    {results.map((step) => (
                        <li key={`${step.area}:${step.label}`} data-step-status={step.status}>
                            {STATUS_GLYPH[step.status]} {step.label}
                            {step.status === 'skipped' ? ' (not available on your account)' : ''}
                            {step.status === 'error' && step.detail ? ` — ${step.detail}` : ''}
                        </li>
                    ))}
                </ul>
            ) : null}
        </article>
    );
};

export default KitInstallStep;
