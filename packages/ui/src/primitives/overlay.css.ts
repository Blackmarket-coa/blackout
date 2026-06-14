import { style, styleVariants } from '@vanilla-extract/css';
import { designColors, designRadii, designSpacing } from '@blackout/design';

// Shared anchor/surface styling for the non-portal floating layers (Popover,
// Menu). Positioning is CSS placement only — v1 has no viewport collision
// detection; callers pick a side that fits.
export const anchor = style({
    position: 'relative',
    display: 'inline-flex',
});

export const surface = style({
    position: 'absolute',
    zIndex: 50,
    minWidth: 160,
    padding: designSpacing.denseGapPx,
    border: `1px solid ${designColors.borderDefault}`,
    borderRadius: designRadii.mdPx,
    background: designColors.bgSurface,
    color: designColors.textPrimary,
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.28)',
});

export const placements = styleVariants({
    bottom: { top: '100%', left: 0, marginTop: 4 },
    'bottom-end': { top: '100%', right: 0, marginTop: 4 },
    top: { bottom: '100%', left: 0, marginBottom: 4 },
    'top-end': { bottom: '100%', right: 0, marginBottom: 4 },
});

export type OverlayPlacement = keyof typeof placements;
