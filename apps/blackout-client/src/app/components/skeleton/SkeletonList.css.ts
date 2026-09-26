import { keyframes, style } from '@vanilla-extract/css';

const pulse = keyframes({
    '0%, 100%': { opacity: 0.55 },
    '50%': { opacity: 1 },
});

export const list = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
});

export const grid = style({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 10,
});

export const block = style({
    borderRadius: 12,
    background: 'var(--bg-input, rgba(148, 163, 184, 0.12))',
    animation: `${pulse} 1.4s ease-in-out infinite`,
    '@media': {
        '(prefers-reduced-motion: reduce)': { animation: 'none' },
    },
});
