import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const TenorGridStyle = style({
    display: 'grid',
    gridTemplateColumns: `repeat(2, 1fr)`,
    gap: config.space.S200,
    padding: `${config.space.S200} ${config.space.S300} ${config.space.S400}`,
});

export const TenorTileStyle = style({
    position: 'relative',
    width: '100%',
    paddingTop: '100%',
    borderRadius: config.radii.R400,
    overflow: 'hidden',
    backgroundColor: color.SurfaceVariant.Container,
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    color: 'inherit',
    selectors: {
        '&:hover, &:focus-visible': {
            outline: `${config.borderWidth.B300} solid ${color.Primary.Main}`,
        },
    },
});

export const TenorTileImgStyle = style({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
});

export const TenorAttributionStyle = style({
    padding: `${config.space.S100} ${config.space.S300}`,
    textAlign: 'center',
    color: color.SurfaceVariant.OnContainer,
    opacity: 0.7,
});

export const TenorEmptyStyle = style({
    padding: `${toRem(60)} ${config.space.S500}`,
    textAlign: 'center',
});
