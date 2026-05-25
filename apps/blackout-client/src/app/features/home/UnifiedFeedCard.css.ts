import { keyframes, style } from '@vanilla-extract/css';
import { recipe } from '@vanilla-extract/recipes';
import { bmcPalette } from '../../styles/theme-engine';

const emberFlicker = keyframes({
    '0%': { opacity: 0.55, transform: 'scale(1)' },
    '50%': { opacity: 1, transform: 'scale(1.12)' },
    '100%': { opacity: 0.55, transform: 'scale(1)' },
});

export const card = recipe({
    base: {
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 20,
        border: '1px solid var(--border-default, #2E5A42)',
        borderLeft: '3px solid var(--card-accent, var(--accent-primary, #D7FF3F))',
        background:
            'linear-gradient(150deg, color-mix(in srgb, var(--bg-input) 94%, var(--card-accent, transparent) 6%), color-mix(in srgb, var(--bg-surface) 90%, transparent))',
        color: 'inherit',
        textDecoration: 'none',
        transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
        selectors: {
            '&:hover': {
                transform: 'translateY(-2px)',
                borderColor: 'var(--card-accent, var(--border-active, #2EF2C5))',
                boxShadow: '0 8px 24px -14px var(--card-accent, rgba(0,0,0,0.4))',
            },
        },
    },
    variants: {
        source: {
            den: { vars: { '--card-accent': bmcPalette.ember } },
            stream: { vars: { '--card-accent': bmcPalette.danger } },
            coliseum: { vars: { '--card-accent': bmcPalette.warning } },
            coalition: { vars: { '--card-accent': bmcPalette.solarMint } },
            status: { vars: { '--card-accent': bmcPalette.neonLeaf } },
            wall: { vars: { '--card-accent': bmcPalette.forest } },
        },
    },
    defaultVariants: { source: 'den' },
});

export const ring = style({
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    flexShrink: 0,
    border: '2px solid var(--card-accent, var(--accent-primary, #D7FF3F))',
    background: 'color-mix(in srgb, var(--card-accent, #D7FF3F) 14%, transparent)',
});

/** Den ring glows like a campfire when motion is allowed. */
export const ringEmber = style({
    selectors: {
        '&::after': {
            content: '""',
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${bmcPalette.ember}, transparent 70%)`,
            opacity: 0.5,
            zIndex: -1,
            animation: `${emberFlicker} 3.2s ease-in-out infinite`,
        },
    },
});

export const body = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
});

export const sourceTag = style({
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: 700,
    color: 'var(--card-accent, var(--text-muted, #9EC4AF))',
});

export const title = style({
    fontSize: 15,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

export const subtitle = style({
    fontSize: 13,
    color: 'var(--text-muted, #9EC4AF)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

export const badge = style({
    minWidth: 22,
    height: 22,
    padding: '0 8px',
    borderRadius: 999,
    background: 'var(--card-accent, var(--accent-primary, #D7FF3F))',
    color: bmcPalette.black,
    fontSize: 11,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
});

const livePulse = keyframes({
    '0%': { boxShadow: '0 0 0 0 rgba(255,93,93,0.55)' },
    '70%': { boxShadow: '0 0 0 7px rgba(255,93,93,0)' },
    '100%': { boxShadow: '0 0 0 0 rgba(255,93,93,0)' },
});

export const liveBadge = style({
    background: bmcPalette.danger,
    color: bmcPalette.white,
    animation: `${livePulse} 2s ease-out infinite`,
    '@media': {
        '(prefers-reduced-motion: reduce)': { animation: 'none' },
    },
});
