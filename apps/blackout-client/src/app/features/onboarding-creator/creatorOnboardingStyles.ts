import type { CSSProperties } from 'react';
import type { CreatorOnboardingProgress } from './creatorOnboardingState';

/** Read-only view of persisted creator progress passed down to each step. */
export type CreatorStepDraft = Pick<
    CreatorOnboardingProgress,
    | 'selectedArchetypes'
    | 'linkedProviders'
    | 'selectedDenTypes'
    | 'coalitionOptIn'
    | 'enrolledRewardTier'
    | 'installedKitId'
    | 'firstActionId'
>;

export interface CreatorStepProps {
    draft: CreatorStepDraft;
    patch: (partial: Partial<CreatorOnboardingProgress>) => void;
}

/** Opens an in-app route in a new tab so the wizard tab stays alive. */
export const openInNewTab = (to: string): void => {
    if (typeof window !== 'undefined') {
        window.open(to, '_blank', 'noopener,noreferrer');
    }
};

export const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

export const headerStyle: CSSProperties = {
    padding: '20px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

export const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };

export const subStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

export const bodyStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '12px 16px 16px',
    flex: 1,
};

export const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '14px 16px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
};

export const stepLabelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
};

export const stepTitleStyle: CSSProperties = { fontSize: 16, fontWeight: 700 };

export const stepDescStyle: CSSProperties = {
    fontSize: 13,
    lineHeight: 1.45,
    color: 'var(--text-muted, #9ca3af)',
};

export const accentButton: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

export const ghostButton: CSSProperties = {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'transparent',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    cursor: 'pointer',
};

export const linkButton: CSSProperties = {
    ...ghostButton,
    textDecoration: 'none',
    textAlign: 'center',
    display: 'inline-block',
};

export const chipStyle = (active: boolean): CSSProperties => ({
    padding: '8px 12px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent-primary, #3b82f6)' : 'var(--border-default, #374151)'}`,
    background: active ? 'var(--accent-primary, #3b82f6)' : 'transparent',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
});

export const chipRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };

export const errorStyle: CSSProperties = {
    color: 'var(--text-danger, #f87171)',
    margin: 0,
    fontSize: 13,
};
