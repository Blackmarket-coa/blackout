import { style, styleVariants } from '@vanilla-extract/css';
import { designColors, designRadii } from '@blackout/design';

export const base = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    padding: 0,
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: designRadii.smPx,
    background: designColors.bgInput,
    color: designColors.textPrimary,
    cursor: 'pointer',
    selectors: {
        '&:disabled': { cursor: 'not-allowed', opacity: 0.6 },
    },
});

export const sizes = styleVariants({
    sm: { width: 28, height: 28, fontSize: 13 },
    md: { width: 32, height: 32, fontSize: 15 },
});

export const active = style({
    background: designColors.accentMuted,
    borderColor: designColors.borderActive,
});
