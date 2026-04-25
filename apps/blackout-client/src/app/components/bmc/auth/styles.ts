import type { CSSProperties } from 'react';

export const fieldStyle: CSSProperties = {
    display: 'grid',
    gap: 4,
    fontSize: 13,
};

export const inputStyle: CSSProperties = {
    background: 'var(--bg-surface, #0b0f1a)',
    color: 'var(--text-primary, #f8fafc)',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
};

export const primaryButtonStyle: CSSProperties = {
    width: '100%',
    borderRadius: 8,
    border: '1px solid var(--border-default, #4b5563)',
    background: 'var(--accent, #2563eb)',
    color: '#f8fafc',
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 600,
};

export const secondaryButtonStyle: CSSProperties = {
    width: '100%',
    borderRadius: 8,
    border: '1px solid var(--border-default, #4b5563)',
    background: 'var(--bg-nav, #1f2937)',
    color: 'var(--text-primary, #f8fafc)',
    padding: '10px 14px',
    cursor: 'pointer',
};

export const linkButtonStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--accent, #60a5fa)',
    cursor: 'pointer',
    padding: 0,
    fontSize: 13,
    textDecoration: 'underline',
};

export const tabBarStyle: CSSProperties = {
    display: 'flex',
    gap: 4,
    borderBottom: '1px solid var(--border-default, #374151)',
    marginBottom: 4,
};

export const tabStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    color: active ? 'var(--text-primary, #f8fafc)' : 'var(--text-secondary, #94a3b8)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: active ? 600 : 500,
    borderBottom: active
        ? '2px solid var(--accent, #2563eb)'
        : '2px solid transparent',
});

export const errorTextStyle: CSSProperties = {
    margin: 0,
    color: '#fca5a5',
    fontSize: 13,
};

export const dividerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--text-secondary, #94a3b8)',
    fontSize: 12,
};

export const dividerLineStyle: CSSProperties = {
    flex: 1,
    borderTop: '1px solid var(--border-default, #374151)',
};
