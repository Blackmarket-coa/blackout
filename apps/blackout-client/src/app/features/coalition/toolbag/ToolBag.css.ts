import { style } from '@vanilla-extract/css';

/**
 * The tool bag: a satchel you open over the map, holding everything that isn't
 * a place. Replaces the twelve-tab strip whose only overflow handling was
 * `overflowX: 'auto'`.
 */

/** Satchel button, bottom-right, clear of the mobile bottom tab bar. */
export const bagButton = style({
    position: 'absolute',
    right: 16,
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
    zIndex: 4,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    padding: '0 18px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
});

export const bagGlyph = style({
    fontSize: 20,
    lineHeight: 1,
});

export const bagCount = style({
    minWidth: 20,
    height: 20,
    padding: '0 6px',
    borderRadius: 999,
    background: 'rgba(0,0,0,0.28)',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
});

/** Inventory grid — tiles, the way a game lays out what you're carrying. */
export const grid = style({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
    gap: 10,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
});

export const tile = style({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 104,
    padding: '12px 8px',
    borderRadius: 14,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'background 120ms ease, transform 120ms ease',
    selectors: {
        '&:hover': {
            background: 'var(--bg-surface-hover, rgba(255,255,255,0.07))',
            transform: 'translateY(-1px)',
        },
        '&:active': { transform: 'none' },
    },
    '@media': {
        '(prefers-reduced-motion: reduce)': { transition: 'none' },
    },
});

export const tileGlyph = style({
    fontSize: 26,
    lineHeight: 1,
});

export const tileLabel = style({
    fontSize: 13,
    fontWeight: 700,
});

export const tileHint = style({
    fontSize: 11,
    lineHeight: 1.3,
    color: 'var(--text-muted)',
});

/** A tool opened from the bag fills the sheet, with a way back to the bag. */
export const toolFrame = style({
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: 'min(70vh, 720px)',
});

export const toolBar = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottom: '1px solid var(--border-default)',
    marginBottom: 8,
});

export const backButton = style({
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    padding: '4px 12px',
    fontSize: 13,
    cursor: 'pointer',
});

export const toolTitle = style({
    fontSize: 15,
    fontWeight: 700,
});

export const toolBody = style({
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
});

export const emptyBag = style({
    padding: '24px 8px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 13,
});
