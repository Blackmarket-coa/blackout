import { style, styleVariants } from '@vanilla-extract/css';

/**
 * The map legend. Replaces the row of absolutely-positioned filter chips that
 * overflowed the right edge of a phone and overlapped the row beneath it.
 *
 * A legend rather than a filter bar: it explains what each pin *is* while also
 * being the control that toggles it, so the map reads like a game world's key.
 */

export const dock = style({
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    // Never taller than the map, and never wider than the viewport minus a
    // gutter — the old chip row had neither bound.
    maxHeight: 'calc(100% - 24px)',
    maxWidth: 'calc(100vw - 24px)',
    pointerEvents: 'none',
});

export const puck = style({
    pointerEvents: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    padding: '7px 13px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(0,0,0,0.28)',
    whiteSpace: 'nowrap',
});

export const panel = style({
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    width: 'min(260px, calc(100vw - 24px))',
    border: '1px solid var(--border-default)',
    borderRadius: 14,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.38)',
    overflow: 'hidden',
});

export const panelHeader = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    borderBottom: '1px solid var(--border-default)',
});

export const headerRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
});

export const title = style({
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginRight: 'auto',
});

/** Scrolls internally so a 13-layer legend can never push past the map. */
export const layerList = style({
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflowY: 'auto',
    padding: 6,
    gap: 2,
});

export const layerRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '6px 8px',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
    selectors: {
        '&:hover': { background: 'var(--bg-surface-hover, rgba(255,255,255,0.06))' },
    },
});

export const layerRowMuted = style({
    opacity: 0.45,
});

export const layerLabel = style({
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

export const layerCount = style({
    fontSize: 11,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--text-muted)',
});

export const swatch = style({
    width: 10,
    height: 10,
    borderRadius: 3,
    flexShrink: 0,
});

const controlBase = {
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '3px 9px',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
};

export const control = styleVariants({
    off: controlBase,
    on: {
        ...controlBase,
        background: 'var(--accent-primary, #1ABC9C)',
        borderColor: 'var(--accent-primary, #1ABC9C)',
        color: '#fff',
        fontWeight: 700,
    },
});

export const footerRow = style({
    display: 'flex',
    gap: 6,
    padding: '6px 10px 10px',
    borderTop: '1px solid var(--border-default)',
});

export const footerButton = style({
    flex: 1,
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    padding: '5px 8px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
});
