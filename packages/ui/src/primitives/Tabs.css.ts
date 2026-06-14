import { style } from '@vanilla-extract/css';
import { designColors, designSpacing, designTypography } from '@blackout/design';

export const list = style({
    display: 'flex',
    gap: designSpacing.compactGapPx,
    borderBottom: `1px solid ${designColors.borderDefault}`,
});

export const tab = style({
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    padding: '6px 10px',
    marginBottom: -1,
    borderBottom: '2px solid transparent',
    color: designColors.textSecondary,
    fontFamily: 'inherit',
    fontSize: designTypography.fontSizeMdPx,
    fontWeight: designTypography.fontWeightMedium,
    cursor: 'pointer',
    selectors: {
        '&[aria-selected="true"]': {
            color: designColors.textPrimary,
            borderBottomColor: designColors.accentPrimary,
        },
        '&:disabled': { cursor: 'not-allowed', opacity: 0.6 },
    },
});

export const panel = style({
    paddingTop: designSpacing.comfortableGapPx,
});
