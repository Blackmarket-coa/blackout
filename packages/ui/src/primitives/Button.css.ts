import { style, styleVariants } from '@vanilla-extract/css';
import {
    designColors,
    designRadii,
    designSpacing,
    designTypography,
} from '@blackout/design';

export const base = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: designSpacing.denseGapPx,
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: designRadii.mdPx,
    fontFamily: 'inherit',
    fontWeight: designTypography.fontWeightMedium,
    lineHeight: designTypography.lineHeightTight,
    cursor: 'pointer',
    selectors: {
        '&:disabled': { cursor: 'not-allowed', opacity: 0.6 },
    },
});

export const sizes = styleVariants({
    sm: { padding: '4px 8px', fontSize: designTypography.fontSizeSmPx },
    md: { padding: '6px 10px', fontSize: designTypography.fontSizeMdPx },
});

export const tones = styleVariants({
    primary: {
        background: designColors.accentPrimary,
        borderColor: designColors.accentPrimary,
        color: designColors.bgSurface,
    },
    neutral: {
        background: designColors.bgInput,
        color: designColors.textPrimary,
    },
    danger: {
        background: designColors.danger,
        borderColor: designColors.danger,
        color: designColors.bgSurface,
    },
});
