import { keyframes, style } from '@vanilla-extract/css';
import { bmcPalette } from '../../styles/theme-engine';

const breathe = keyframes({
    '0%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 0.55 },
    '50%': { transform: 'translate3d(2%, -1.5%, 0) scale(1.08)', opacity: 0.9 },
    '100%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 0.55 },
});

const drift = keyframes({
    '0%': { transform: 'translate3d(0, 0, 0)' },
    '50%': { transform: 'translate3d(-3%, 2%, 0)' },
    '100%': { transform: 'translate3d(0, 0, 0)' },
});

export const root = style({
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 0,
});

/** Time-of-day wash; the gradient itself comes from the `--home-tint` var. */
export const tintLayer = style({
    position: 'absolute',
    inset: 0,
    backgroundImage: 'var(--home-tint)',
    transition: 'background-image 1.2s ease',
});

const blob = style({
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(60px)',
    opacity: 0.6,
    willChange: 'transform, opacity',
});

export const blobLeaf = style([
    blob,
    {
        width: '46vw',
        height: '46vw',
        top: '-12vw',
        left: '-8vw',
        background: `radial-gradient(circle at 50% 50%, ${bmcPalette.forest}, transparent 70%)`,
    },
]);

export const blobMint = style([
    blob,
    {
        width: '38vw',
        height: '38vw',
        bottom: '-14vw',
        right: '-6vw',
        background: `radial-gradient(circle at 50% 50%, var(--home-glow, ${bmcPalette.solarMint}), transparent 70%)`,
    },
]);

export const blobEmber = style([
    blob,
    {
        width: '30vw',
        height: '30vw',
        top: '38%',
        left: '55%',
        opacity: 0.4,
        background: `radial-gradient(circle at 50% 50%, ${bmcPalette.ember}, transparent 72%)`,
    },
]);

/** Applied only when motion is allowed. */
export const animatedLeaf = style({ animation: `${breathe} 16s ease-in-out infinite` });
export const animatedMint = style({ animation: `${drift} 22s ease-in-out infinite` });
export const animatedEmber = style({ animation: `${breathe} 19s ease-in-out infinite 2s` });
