import { style, styleVariants } from '@vanilla-extract/css';
import { designColors, designRadii, designTypography } from '@blackout/design';

export const wrapper = style({
    position: 'relative',
    display: 'inline-flex',
});

export const bubble = style({
    position: 'absolute',
    zIndex: 60,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    padding: '4px 8px',
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: designRadii.smPx,
    background: designColors.bgNav,
    color: designColors.textPrimary,
    fontSize: designTypography.fontSizeXsPx,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.24)',
});

export const placements = styleVariants({
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 6 },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 },
});

export type TooltipPlacement = keyof typeof placements;
