import { useState } from 'react';
import { usePlaybookTrial } from './usePlaybookTrial';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

/**
 * Banner that sits above the room header when the den is in its 14-day
 * try-before-commit window. Three actions: commit, switch playbook,
 * revert to Hearth. The brief calls for an *auto-commit to Hearth* if the
 * trial lapses (non-coercion); the UI mirrors that by leading with
 * "Commit" as the primary action and showing "Revert to Hearth" as
 * always-available, never destructive.
 */
export interface TrialBannerProps {
    roomId: string;
}

const styles = {
    root: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        background: 'rgba(214, 154, 46, 0.15)',
        borderBottom: '1px solid rgba(214, 154, 46, 0.4)',
        color: 'var(--text-primary)',
        gap: 12,
    } as const,
    chips: { display: 'flex', gap: 8 } as const,
    chip: (primary: boolean) => ({
        border: `1px solid ${primary ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        background: primary ? 'var(--accent-muted)' : 'var(--bg-input)',
        color: 'var(--text-primary)',
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 12,
        cursor: 'pointer',
    }),
    lapsed: {
        background: 'rgba(239, 83, 80, 0.12)',
        borderColor: 'rgba(239, 83, 80, 0.4)',
    } as const,
    label: { fontSize: 12 } as const,
};

export function TrialBanner({ roomId }: TrialBannerProps) {
    const trial = usePlaybookTrial(roomId);
    const [busy, setBusy] = useState<'commit' | 'switch' | 'revert' | null>(null);

    if (!trial.isTrial || !trial.playbook) return null;

    const lapsed = trial.daysRemaining < 0;
    const label = lapsed
        ? `Trial lapsed · auto-commit to ${BLACKOUT_TERMS.playbook.singular} "Hearth" pending`
        : `${trial.daysRemaining} day${trial.daysRemaining === 1 ? '' : 's'} left in this ${BLACKOUT_TERMS.playbook.singular} trial`;

    const run = async (action: 'commit' | 'revert', fn: () => Promise<void>) => {
        setBusy(action);
        try {
            await fn();
        } finally {
            setBusy(null);
        }
    };

    return (
        <div
            data-testid="trial-banner"
            style={{ ...styles.root, ...(lapsed ? styles.lapsed : {}) }}
        >
            <span style={styles.label}>{label}</span>
            <div style={styles.chips}>
                <button
                    type="button"
                    data-testid="trial-commit"
                    style={styles.chip(true)}
                    onClick={() => void run('commit', trial.commit)}
                    disabled={busy !== null}
                >
                    {busy === 'commit' ? 'Committing…' : 'Commit playbook'}
                </button>
                <button
                    type="button"
                    data-testid="trial-revert"
                    style={styles.chip(false)}
                    onClick={() => void run('revert', trial.revertToHearth)}
                    disabled={busy !== null}
                >
                    {busy === 'revert' ? 'Reverting…' : 'Revert to Hearth'}
                </button>
            </div>
        </div>
    );
}

export default TrialBanner;
