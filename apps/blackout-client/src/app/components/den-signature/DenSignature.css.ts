import { style } from '@vanilla-extract/css';
import { config } from 'folds';

/**
 * Den-signature primitives carry the visual identity of a den at a glance:
 * a leaf shape for structure, a single-stroke glyph for leadership, a thin
 * phenology bar for lifecycle. The CSS lives here so the SVG-bearing
 * components can stay pure markup; the variants are deliberately small (size
 * only) to keep the system coherent.
 */
export const Badge = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
});

export const BadgeSm = style({ width: 16, height: 16 });
export const BadgeMd = style({ width: 24, height: 24 });
export const BadgeLg = style({ width: 36, height: 36 });

export const Glyph = style({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
});

export const GlyphSm = style({ width: 14, height: 14 });
export const GlyphMd = style({ width: 18, height: 18 });

export const PhenologyBarRoot = style({
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 2,
    width: '100%',
    height: 3,
});

export const PhenologySegment = style({
    height: 3,
    borderRadius: 1,
});

/**
 * Header strip composes badge + glyph + name + phenology. It deliberately
 * doesn't add a background pattern inside the message body — only a tinted
 * top band on governance-active dens.
 */
export const HeaderStrip = style({
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S100,
    padding: `${config.space.S100} ${config.space.S200}`,
    borderTopLeftRadius: config.radii.R300,
    borderTopRightRadius: config.radii.R300,
});

export const HeaderStripRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S200,
});

export const HeaderStripDomain = style({
    opacity: 0.75,
});
