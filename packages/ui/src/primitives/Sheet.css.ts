import { style } from '@vanilla-extract/css';
import { designColors, designRadii, designSpacing, designTypography } from '@blackout/design';

export const root = style({
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
});

export const backdrop = style({
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
});

export const panel = style({
    position: 'relative',
    zIndex: 1,
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: 640,
    maxHeight: '85vh',
    overflow: 'auto',
    padding: designSpacing.comfortableGapPx,
    borderTop: `1px solid ${designColors.borderDefault}`,
    borderTopLeftRadius: designRadii.lgPx,
    borderTopRightRadius: designRadii.lgPx,
    background: designColors.bgSurface,
    color: designColors.textPrimary,
    boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
    outline: 'none',
});

export const title = style({
    margin: 0,
    marginBottom: designSpacing.compactGapPx,
    fontSize: designTypography.fontSizeLgPx,
    fontWeight: designTypography.fontWeightSemibold,
});
