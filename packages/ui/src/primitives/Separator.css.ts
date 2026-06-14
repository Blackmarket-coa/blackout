import { style, styleVariants } from '@vanilla-extract/css';
import { designColors } from '@blackout/design';

export const base = style({
    border: 'none',
    margin: 0,
    flex: 'none',
    alignSelf: 'stretch',
});

export const orientations = styleVariants({
    horizontal: {
        height: 0,
        borderTop: `1px solid ${designColors.borderDefault}`,
    },
    vertical: {
        width: 0,
        borderLeft: `1px solid ${designColors.borderDefault}`,
    },
});
