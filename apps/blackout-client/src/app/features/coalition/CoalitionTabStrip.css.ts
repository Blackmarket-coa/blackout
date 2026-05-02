import { style } from '@vanilla-extract/css';

export const Strip = style({
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    selectors: {
        '&::-webkit-scrollbar': {
            display: 'none',
        },
    },
});

export const Tab = style({
    position: 'relative',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 16,
    fontWeight: 500,
    padding: '6px 4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'color 120ms ease',
    selectors: {
        '&:hover': {
            color: 'var(--text-primary)',
        },
        '&[aria-selected="true"]': {
            color: 'var(--text-primary)',
            fontWeight: 700,
        },
        '&[aria-selected="true"]::after': {
            content: '""',
            position: 'absolute',
            left: '20%',
            right: '20%',
            bottom: -10,
            height: 2,
            borderRadius: 1,
            background: 'var(--accent-primary, #1ABC9C)',
        },
    },
});

export const Spacer = style({
    flex: 1,
});

export const SearchButton = style({
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 4,
    fontSize: 18,
    selectors: {
        '&:hover': {
            color: 'var(--text-primary)',
        },
    },
});

export const ScopeBadge = style({
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '2px 8px',
});
