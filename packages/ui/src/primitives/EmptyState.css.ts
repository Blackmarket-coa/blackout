import { style } from '@vanilla-extract/css';
import { designColors, designSpacing, designTypography } from '@blackout/design';

export const root = style({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: designSpacing.compactGapPx,
    padding: designSpacing.comfortableGapPx,
    color: designColors.textSecondary,
});

export const icon = style({
    color: designColors.textMuted,
});

export const title = style({
    margin: 0,
    fontSize: designTypography.fontSizeLgPx,
    fontWeight: designTypography.fontWeightSemibold,
    color: designColors.textPrimary,
});

export const description = style({
    margin: 0,
    fontSize: designTypography.fontSizeMdPx,
    color: designColors.textSecondary,
});

export const action = style({
    marginTop: designSpacing.compactGapPx,
});
