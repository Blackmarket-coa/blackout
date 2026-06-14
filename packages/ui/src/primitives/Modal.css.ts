import { style } from '@vanilla-extract/css';
import { designColors, designRadii, designSpacing, designTypography } from '@blackout/design';

export const root = style({
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
});

export const backdrop = style({
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
});

export const dialog = style({
    position: 'relative',
    zIndex: 1,
    boxSizing: 'border-box',
    width: 'min(560px, 92vw)',
    maxHeight: '90vh',
    overflow: 'auto',
    padding: designSpacing.comfortableGapPx,
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: designRadii.lgPx,
    background: designColors.bgSurface,
    color: designColors.textPrimary,
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)',
    outline: 'none',
});

export const title = style({
    margin: 0,
    marginBottom: designSpacing.compactGapPx,
    fontSize: designTypography.fontSizeLgPx,
    fontWeight: designTypography.fontWeightSemibold,
});
