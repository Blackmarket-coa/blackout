import type { CSSProperties } from 'react';

/**
 * Inline styles for the panel. The panel is a narrow column (a browser side
 * panel is ~360–400px wide), so everything stacks.
 */
export const panelRootStyle: CSSProperties = {
    minHeight: '100vh',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-surface, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 14,
};

export const panelHeaderStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-default, #374151)',
    flexShrink: 0,
};

export const panelMainStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
};

export const sectionStyle: CSSProperties = {
    display: 'grid',
    gap: 2,
    padding: '8px 4px',
};

export const sectionHeadingStyle: CSSProperties = {
    margin: '4px 8px',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--text-secondary, #94a3b8)',
};

export const rowLinkStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    color: 'inherit',
    textDecoration: 'none',
};

export const mutedTextStyle: CSSProperties = {
    margin: 0,
    fontSize: 13,
    color: 'var(--text-secondary, #94a3b8)',
};

export const cardStyle: CSSProperties = {
    margin: 12,
    padding: 16,
    display: 'grid',
    gap: 10,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
};

export const linkStyle: CSSProperties = {
    color: 'var(--accent, #60a5fa)',
};
