import { style } from '@vanilla-extract/css';
import { designColors, designTypography } from '@blackout/design';

export const root = style({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: 'inherit',
    fontSize: designTypography.fontSizeMdPx,
    color: designColors.textPrimary,
    cursor: 'pointer',
    selectors: {
        '&[data-disabled="true"]': { cursor: 'not-allowed', opacity: 0.6 },
    },
});

export const input = style({
    width: 16,
    height: 16,
    margin: 0,
    accentColor: designColors.accentPrimary,
    cursor: 'inherit',
});
