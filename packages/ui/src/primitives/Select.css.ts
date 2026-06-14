import { style } from '@vanilla-extract/css';
import { designColors, designRadii, designTypography } from '@blackout/design';

export const base = style({
    boxSizing: 'border-box',
    padding: '6px 10px',
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: designRadii.mdPx,
    background: designColors.bgInput,
    color: designColors.textPrimary,
    fontFamily: 'inherit',
    fontSize: designTypography.fontSizeMdPx,
    cursor: 'pointer',
    selectors: {
        '&:focus': { outline: 'none', borderColor: designColors.borderActive },
        '&:disabled': { cursor: 'not-allowed', opacity: 0.6 },
    },
});

export const invalid = style({ borderColor: designColors.danger });
