import type { CSSProperties } from 'react';

/** Shared inline styles for the Coalitions surfaces (theme vars, legacy teal fallback). */

export const buttonStyle = (
    variant: 'primary' | 'subtle' | 'danger' = 'subtle'
): CSSProperties => ({
    border: '1px solid var(--border-default)',
    background:
        variant === 'primary'
            ? 'var(--accent-primary, #1ABC9C)'
            : variant === 'danger'
            ? 'transparent'
            : 'var(--bg-input)',
    color:
        variant === 'primary'
            ? 'var(--bg-surface)'
            : variant === 'danger'
            ? 'var(--danger, #f04747)'
            : 'var(--text-primary)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
});

export const sectionLabelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    padding: '14px 4px 4px',
};

export const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 4px',
};

export const nameStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 14,
};

export const mutedStyle: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)' };

export const roleChipStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'var(--accent-primary, #1ABC9C)',
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '2px 8px',
};

export const cardStyle: CSSProperties = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

export const statTileStyle: CSSProperties = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 120,
};

export const inputStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 14,
};

export const meterTrackStyle: CSSProperties = {
    height: 8,
    borderRadius: 999,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
};

export const meterFillStyle = (fraction: number): CSSProperties => ({
    height: '100%',
    width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
    background: 'var(--accent-primary, #1ABC9C)',
    transition: 'width 240ms ease',
});

export const formatCents = (cents: number): string =>
    `$${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}`;
