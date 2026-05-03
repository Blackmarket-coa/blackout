import type { CSSProperties } from 'react';
import { useCall } from './CallProvider';

const BADGE_BASE: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid var(--border-default)',
};

const STYLES: Record<'good' | 'warn' | 'bad', CSSProperties> = {
    good: { ...BADGE_BASE, color: 'var(--text-success)', background: 'var(--bg-success-soft)' },
    warn: { ...BADGE_BASE, color: 'var(--text-warning)', background: 'var(--bg-warning-soft)' },
    bad: { ...BADGE_BASE, color: 'var(--text-danger)', background: 'var(--bg-danger-soft)' },
};

interface BadgeView {
    tone: 'good' | 'warn' | 'bad';
    label: string;
    title: string;
}

export const describeE2eeBadge = (
    e2ee: ReturnType<typeof useCall>['e2ee'],
): BadgeView => {
    if (e2ee.status === 'active') {
        const label = e2ee.mode === 'broadcast' ? 'Broadcast E2EE' : 'End-to-end encrypted';
        return {
            tone: 'good',
            label,
            title:
                e2ee.mode === 'broadcast'
                    ? 'Broadcast sender keys: presenters publish, audience subscribes. SFU cannot read media plaintext.'
                    : 'Per-call media keys negotiated. SFU cannot read media plaintext.',
        };
    }
    if (e2ee.status === 'disabled') {
        return {
            tone: 'warn',
            label: 'Transport-only',
            title: 'Media E2EE was explicitly disabled. Only DTLS-SRTP protects this call.',
        };
    }
    if (e2ee.status === 'pending') {
        return { tone: 'warn', label: 'Negotiating…', title: e2ee.reason };
    }
    return { tone: 'bad', label: 'No media E2EE', title: e2ee.reason };
};

export const EncryptionBadge = () => {
    const { e2ee } = useCall();
    const view = describeE2eeBadge(e2ee);
    return (
        <span style={STYLES[view.tone]} title={view.title} aria-label={view.title}>
            <span aria-hidden="true">{view.tone === 'good' ? '🔒' : view.tone === 'warn' ? '⚠' : '✕'}</span>
            {view.label}
        </span>
    );
};
