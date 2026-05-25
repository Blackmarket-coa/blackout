import { style } from '@vanilla-extract/css';

export const canvas = style({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 0,
    opacity: 0.5,
});
