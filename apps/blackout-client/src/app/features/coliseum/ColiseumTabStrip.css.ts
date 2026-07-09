import { style } from '@vanilla-extract/css';

export const strip = style({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 12px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    selectors: { '&::-webkit-scrollbar': { display: 'none' } },
});

export const tab = style({
    position: 'relative',
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--text-secondary)',
    fontSize: 15,
    fontWeight: 600,
    padding: '10px 10px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
});

export const tabActive = style({
    color: 'var(--text-primary)',
    fontWeight: 800,
    borderBottomColor: 'var(--accent-primary, #1ABC9C)',
});

export const scopeBadge = style({
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '2px 8px',
    marginRight: 4,
});

export const spacer = style({ flex: 1 });

export const iconButton = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    selectors: {
        '&:hover': { background: 'var(--bg-surface-hover, rgba(255,255,255,0.06))' },
    },
});
