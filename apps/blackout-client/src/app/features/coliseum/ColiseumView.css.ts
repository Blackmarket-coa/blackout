import { style } from '@vanilla-extract/css';

export const root = style({
    display: 'grid',
    gridTemplateRows: 'auto auto 1fr',
    height: '100%',
    minHeight: 0,
});

export const body = style({
    minHeight: 0,
    overflow: 'auto',
});

/** Back bar shown while drilled into a debate thread. */
export const backBar = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
});

export const backButton = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 20,
    cursor: 'pointer',
    selectors: {
        '&:hover': { background: 'var(--bg-surface-hover, rgba(255,255,255,0.06))' },
    },
});

export const backTitle = style({
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--text-primary)',
});
