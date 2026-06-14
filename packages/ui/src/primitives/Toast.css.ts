import { style, styleVariants } from '@vanilla-extract/css';
import { designColors, designRadii, designSpacing, designTypography } from '@blackout/design';

export const viewport = style({
    position: 'fixed',
    zIndex: 10000,
    bottom: 16,
    right: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: designSpacing.compactGapPx,
    maxWidth: 360,
});

export const toast = style({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 10px',
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: designRadii.mdPx,
    background: designColors.bgSurface,
    color: designColors.textPrimary,
    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.36)',
});

export const tones = styleVariants({
    neutral: {},
    success: { borderColor: designColors.success },
    danger: { borderColor: designColors.danger },
});

export const message = style({
    flex: 1,
    fontSize: designTypography.fontSizeMdPx,
    lineHeight: designTypography.lineHeightNormal,
});

export const dismiss = style({
    flex: 'none',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: designColors.textSecondary,
    cursor: 'pointer',
    lineHeight: 1,
});
