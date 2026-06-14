import { style, styleVariants } from '@vanilla-extract/css';
import { designColors, designTypography } from '@blackout/design';

export const base = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    overflow: 'hidden',
    borderRadius: '50%',
    background: designColors.accentMuted,
    color: designColors.textPrimary,
    fontFamily: 'inherit',
    fontWeight: designTypography.fontWeightSemibold,
    textTransform: 'uppercase',
    userSelect: 'none',
});

export const sizes = styleVariants({
    sm: { width: 24, height: 24, fontSize: designTypography.fontSizeXsPx },
    md: { width: 32, height: 32, fontSize: designTypography.fontSizeSmPx },
    lg: { width: 48, height: 48, fontSize: designTypography.fontSizeLgPx },
});

export const image = style({
    width: '100%',
    height: '100%',
    objectFit: 'cover',
});
