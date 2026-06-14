import { style } from '@vanilla-extract/css';
import { designColors } from '@blackout/design';

export const track = style({
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    width: 36,
    height: 20,
    padding: 0,
    flex: 'none',
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: 999,
    background: designColors.bgInput,
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    selectors: {
        '&[aria-checked="true"]': {
            background: designColors.accentPrimary,
            borderColor: designColors.accentPrimary,
        },
        '&:disabled': { cursor: 'not-allowed', opacity: 0.6 },
    },
});

export const thumb = style({
    position: 'absolute',
    top: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: designColors.bgSurface,
    transition: 'transform 0.15s ease',
    selectors: {
        [`${track}[aria-checked="true"] &`]: { transform: 'translateX(16px)' },
    },
});
