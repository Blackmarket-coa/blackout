import { keyframes, style, styleVariants } from '@vanilla-extract/css';
import { designColors } from '@blackout/design';

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });

export const base = style({
    display: 'inline-block',
    flex: 'none',
    borderRadius: '50%',
    border: '2px solid transparent',
    borderTopColor: designColors.accentPrimary,
    borderRightColor: designColors.accentPrimary,
    animation: `${spin} 0.6s linear infinite`,
});

export const sizes = styleVariants({
    sm: { width: 12, height: 12 },
    md: { width: 18, height: 18 },
});
