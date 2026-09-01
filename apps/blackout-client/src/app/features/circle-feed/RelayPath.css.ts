import { style } from '@vanilla-extract/css';

export const path = style({
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--text-secondary, #9BB3A4)',
    font: 'inherit',
    fontSize: 12,
    lineHeight: 1.5,
    textAlign: 'left',
    cursor: 'pointer',
    selectors: {
        '&:hover, &:focus-visible': { color: 'var(--text-primary, #E8F5EC)' },
    },
});

export const hop = style({
    whiteSpace: 'nowrap',
});

export const viewerHop = style({
    color: 'var(--accent-primary, #D7FF3F)',
    fontWeight: 600,
});

/**
 * A relayer who has since withdrawn. Struck through rather than removed: the
 * item genuinely travelled through them, and hiding that would misrepresent the
 * chain.
 */
export const withdrawnHop = style({
    textDecoration: 'line-through',
    opacity: 0.6,
});

export const arrow = style({
    opacity: 0.5,
});

export const alsoRelayed = style({
    marginInlineStart: 6,
    opacity: 0.8,
});
