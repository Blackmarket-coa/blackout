import { style } from '@vanilla-extract/css';

/**
 * Mirrors `features/coliseum/ColiseumTabStrip.css.ts` so the two hubs read as
 * the same product. Kept as a separate module rather than shared because the
 * Coliseum strip lives inside the arena palette override and this one does not.
 */

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

export const spacer = style({ flex: 1 });

export const countBadge = style({
    marginLeft: 6,
    minWidth: 18,
    height: 18,
    padding: '0 5px',
    borderRadius: 999,
    background: 'var(--accent-primary)',
    color: 'var(--bg-surface)',
    fontSize: 11,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
});
