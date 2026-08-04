import { style } from '@vanilla-extract/css';

export const root = style({
    display: 'grid',
    gridTemplateRows: 'auto auto 1fr',
    height: '100%',
    minHeight: 0,
});

export const backBar = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
});

export const backButton = style({
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 20,
    lineHeight: 1,
    padding: '4px 8px',
    cursor: 'pointer',
});

export const backTitle = style({
    fontSize: 15,
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

/**
 * Segmented control rather than a tab strip: these are lenses on one topic, not
 * separate destinations, and the distinction should be visible.
 */
export const sectionRail = style({
    display: 'flex',
    gap: 4,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    selectors: { '&::-webkit-scrollbar': { display: 'none' } },
});

export const sectionLink = style({
    flexShrink: 0,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    borderRadius: 999,
    padding: '5px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
});

export const sectionLinkActive = style({
    background: 'var(--accent-primary, #1ABC9C)',
    borderColor: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
});

export const body = style({
    minHeight: 0,
    overflow: 'auto',
    scrollBehavior: 'smooth',
});

export const sectionHeading = style({
    margin: '0 0 4px',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
});

/** Scroll target offset so a jumped-to heading is not hidden under the rail. */
export const section = style({
    scrollMarginTop: 12,
});

export const propositionTitle = style({
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1.3,
});

export const pulseRow = style({
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
});

export const pulseStat = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 84,
});

export const pulseValue = style({
    fontSize: 20,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
});

export const pulseLabel = style({
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
});

export const seedVideo = style({
    width: '100%',
    borderRadius: 12,
    background: '#000',
    maxHeight: 420,
});

export const seedImage = style({
    width: '100%',
    borderRadius: 12,
    objectFit: 'cover',
    maxHeight: 420,
});
