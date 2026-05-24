import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const ToastViewport = style({
    position: 'fixed',
    bottom: config.space.S400,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S200,
    width: 'max-content',
    maxWidth: `min(${toRem(420)}, calc(100vw - 2 * ${config.space.S400}))`,
    pointerEvents: 'none',
});

export const ToastCard = style({
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S200,
    padding: `${config.space.S200} ${config.space.S300}`,
    borderRadius: config.radii.R400,
    boxShadow: config.shadow.E200,
});
