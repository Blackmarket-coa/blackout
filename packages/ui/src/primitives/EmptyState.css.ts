import { style } from '@vanilla-extract/css';
import { designColors, designSpacing, designTypography } from '@blackout/design';

export const root = style({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: designSpacing.compactGapPx,
    padding: '28px 20px',
    // Dashed frame + icon read as "settled: there is nothing here", distinct
    // from the pulsing skeleton blocks used while content is still loading.
    border: `1px dashed ${designColors.borderDefault}`,
    borderRadius: 14,
    color: designColors.textSecondary,
});

export const icon = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(148, 163, 184, 0.1)',
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
