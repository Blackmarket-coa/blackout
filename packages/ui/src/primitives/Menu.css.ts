import { style } from '@vanilla-extract/css';
import { designColors, designRadii, designTypography } from '@blackout/design';

export const item = style({
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    border: 'none',
    background: 'transparent',
    borderRadius: designRadii.smPx,
    color: designColors.textPrimary,
    fontFamily: 'inherit',
    fontSize: designTypography.fontSizeMdPx,
    textAlign: 'left',
    cursor: 'pointer',
    selectors: {
        '&:hover:not(:disabled)': { background: designColors.bgSurfaceHover },
        '&:focus': { outline: 'none', background: designColors.bgSurfaceHover },
        '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
    },
});
