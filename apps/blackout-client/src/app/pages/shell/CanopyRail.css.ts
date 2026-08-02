import { style } from '@vanilla-extract/css';

/**
 * Discord-style canopy rail. Sizing follows the design tokens
 * (`defaultSpaceColumnWidthPx: 64`, `navRailButtonSizePx: 40`,
 * `navRailSectionGapPx: 8`); colors stay on the semantic CSS custom
 * property contract so every theme (including `amoled_night`, where
 * `--bg-nav` equals `--bg-surface`) keeps the rail legible — column
 * separation comes from `--border-default`, never background contrast.
 *
 * Motion (tile radius morph, pill growth) is disabled both for the OS
 * `prefers-reduced-motion` query and for the in-app accessibility setting,
 * which the component surfaces as a `data-reduced-motion` attribute on the
 * rail root.
 */

const REDUCED_MOTION_ANCESTOR = '[data-reduced-motion] &';

const railBase = style({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    background: 'var(--bg-nav, #112619)',
    color: 'var(--text-primary, #F7FFF9)',
    borderRight: '1px solid var(--border-default, #2E5A42)',
    minHeight: 0,
    overflow: 'hidden',
});

export const rail = style([railBase, { width: 64, flex: '0 0 64px' }]);

/** Slimmer variant composed inside CanopyServerPage's compact drawer. */
export const railDrawer = style([railBase, { width: 56, flex: '0 0 56px' }]);

/**
 * Scrollable middle section. `position: relative` is load-bearing:
 * `ThreadUnreadBadgeMount` anchors its absolutely-positioned badge against
 * the nearest positioned ancestor of the registry threads entry.
 */
export const scroll = style({
    position: 'relative',
    flex: 1,
    minHeight: 0,
    width: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    scrollbarWidth: 'none',
    selectors: {
        '&::-webkit-scrollbar': { display: 'none' },
    },
});

/** Full-width row wrapping one tile, so the unread pill can hug the rail edge. */
export const tileRow = style({
    position: 'relative',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    flexShrink: 0,
});

export const tile = style({
    position: 'relative',
    width: 44,
    height: 44,
    padding: 0,
    border: '1px solid var(--border-default, #2E5A42)',
    borderRadius: 22,
    background: 'var(--bg-input, #1A2420)',
    color: 'var(--text-primary, #F7FFF9)',
    fontSize: 14,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    outlineOffset: 2,
    transition: 'border-radius 150ms ease, background 150ms ease',
    selectors: {
        '&:hover': {
            borderRadius: 14,
            background: 'var(--bg-surface-hover, #151B1C)',
        },
        '&[aria-current="page"]': {
            borderRadius: 14,
            background: 'var(--accent-muted, #2E5A42)',
            borderColor: 'var(--border-active, #2EF2C5)',
        },
        [REDUCED_MOTION_ANCESTOR]: { transition: 'none' },
    },
    '@media': {
        '(prefers-reduced-motion: reduce)': { transition: 'none' },
    },
});

export const tileImg = style({
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 'inherit',
});

/**
 * Left-edge state pill: tall for the active canopy, a short nub for unread,
 * collapsed otherwise (`data-state="none"`).
 */
export const pill = style({
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 4,
    height: 0,
    borderRadius: '0 4px 4px 0',
    background: 'var(--text-primary, #F7FFF9)',
    transition: 'height 150ms ease',
    selectors: {
        '&[data-state="active"]': { height: 32 },
        '&[data-state="unread"]': { height: 8 },
        [REDUCED_MOTION_ANCESTOR]: { transition: 'none' },
    },
    '@media': {
        '(prefers-reduced-motion: reduce)': { transition: 'none' },
    },
});

/** Counted mention badge, ring-cut out of the rail background. */
export const mentionBadge = style({
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 16,
    height: 16,
    padding: '0 4px',
    borderRadius: 999,
    background: 'var(--danger, #FF5D5D)',
    color: 'var(--text-primary, #F7FFF9)',
    border: '2px solid var(--bg-nav, #112619)',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
});

/**
 * Fixed utility tiles (home, create, discover). 40px matches
 * `navRailButtonSizePx` and the registry rail buttons rendered below them.
 */
export const actionTile = style({
    width: 40,
    height: 40,
    flexShrink: 0,
    border: '1px solid var(--border-default, #2E5A42)',
    borderRadius: 12,
    background: 'var(--bg-input, #1A2420)',
    color: 'var(--text-primary, #F7FFF9)',
    fontSize: 16,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    cursor: 'pointer',
    outlineOffset: 2,
    selectors: {
        '&:hover': { background: 'var(--bg-surface-hover, #151B1C)' },
        '&[aria-current="page"]': { borderColor: 'var(--accent-primary, #D7FF3F)' },
    },
});

/** Dashed empty-state tile (HomeFeed empty-state convention). */
export const emptyTile = style([
    actionTile,
    {
        border: '1px dashed var(--border-default, #2E5A42)',
        background: 'transparent',
        color: 'var(--text-muted, #9EC4AF)',
    },
]);

export const divider = style({
    width: 32,
    height: 1,
    flexShrink: 0,
    background: 'var(--border-default, #2E5A42)',
});
