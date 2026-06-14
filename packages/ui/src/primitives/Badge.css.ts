import { style, styleVariants } from '@vanilla-extract/css';
import {
    designColors,
    designRadii,
    designTypography,
} from '@blackout/design';

export const base = style({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: designRadii.pillPx,
    fontSize: designTypography.fontSizeSmPx,
    lineHeight: designTypography.lineHeightTight,
    color: designColors.textPrimary,
});

export const tones = styleVariants({
    neutral: {},
    accent: {
        borderColor: designColors.accentPrimary,
        color: designColors.accentPrimary,
    },
    danger: {
        borderColor: designColors.danger,
        color: designColors.danger,
    },
});

export const dismiss = style({
    display: 'inline-flex',
    alignItems: 'center',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: designColors.textSecondary,
    cursor: 'pointer',
    lineHeight: 1,
});
