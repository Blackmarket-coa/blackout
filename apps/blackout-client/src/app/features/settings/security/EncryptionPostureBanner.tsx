import type { CSSProperties } from 'react';
import { summarizePosture, type AccountPosture, type PostureAction, type PostureSeverity } from './encryptionPosture';

const BASE: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    fontSize: 13,
};

const TONE: Record<PostureSeverity, CSSProperties> = {
    ok: { ...BASE, color: 'var(--text-success)', background: 'var(--bg-success-soft)' },
    info: { ...BASE, color: 'var(--text-primary)', background: 'var(--bg-info-soft)' },
    warn: { ...BASE, color: 'var(--text-warning)', background: 'var(--bg-warning-soft)' },
    critical: { ...BASE, color: 'var(--text-danger)', background: 'var(--bg-danger-soft)' },
};

const ICON: Record<PostureSeverity, string> = {
    ok: '🔒',
    info: 'ℹ',
    warn: '⚠',
    critical: '✕',
};

export interface EncryptionPostureBannerProps {
    posture: AccountPosture;
    onAction?: (action: PostureAction) => void;
}

export const EncryptionPostureBanner = ({ posture, onAction }: EncryptionPostureBannerProps) => {
    const verdict = summarizePosture(posture);
    if (verdict.severity === 'ok') return null;

    return (
        <div style={TONE[verdict.severity]} role="status" aria-live="polite">
            <span aria-hidden="true">{ICON[verdict.severity]}</span>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{verdict.headline}</div>
                <div style={{ marginTop: 4 }}>{verdict.detail}</div>
                {verdict.actions.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        {verdict.actions.map((action) => (
                            <button
                                key={action.id}
                                type="button"
                                onClick={() => onAction?.(action)}
                                style={{
                                    border: '1px solid currentColor',
                                    borderRadius: 6,
                                    padding: '4px 10px',
                                    background: 'transparent',
                                    color: 'inherit',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
