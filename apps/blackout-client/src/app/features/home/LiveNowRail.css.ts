import { keyframes, style } from '@vanilla-extract/css';
import { bmcPalette } from '../../styles/theme-engine';

export const section = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '4px 4px 12px',
});

export const label = style({
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9EC4AF)',
    margin: '8px 4px 0',
});

export const rail = style({
    display: 'flex',
    gap: 12,
    overflowX: 'auto',
    paddingBottom: 4,
    scrollbarWidth: 'thin',
});

export const card = style({
    position: 'relative',
    flex: '0 0 auto',
    width: 210,
    minHeight: 96,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    gap: 6,
    padding: '12px 14px',
    borderRadius: 18,
    border: '1px solid var(--border-default, #2E5A42)',
    color: 'inherit',
    textDecoration: 'none',
    overflow: 'hidden',
    background: `linear-gradient(150deg, color-mix(in srgb, ${bmcPalette.forest} 30%, var(--bg-input)), color-mix(in srgb, var(--bg-surface) 85%, transparent))`,
    transition: 'transform 160ms ease, box-shadow 160ms ease',
    selectors: {
        '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 10px 26px -16px rgba(0,0,0,0.5)',
        },
    },
});

const livePulse = keyframes({
    '0%': { boxShadow: '0 0 0 0 rgba(255,93,93,0.6)' },
    '70%': { boxShadow: '0 0 0 6px rgba(255,93,93,0)' },
    '100%': { boxShadow: '0 0 0 0 rgba(255,93,93,0)' },
});

export const liveTag = style({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: bmcPalette.danger,
});

export const liveDot = style({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: bmcPalette.danger,
    animation: `${livePulse} 2s ease-out infinite`,
    '@media': {
        '(prefers-reduced-motion: reduce)': { animation: 'none' },
    },
});

export const title = style({
    fontSize: 14,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});
