// @blackout/design – design tokens, fonts, icons, theme definitions

export const designSpacing = Object.freeze({
    compactGapPx: 8,
    comfortableGapPx: 12,
    denseGapPx: 6,
});

export const designBreakpoints = Object.freeze({
    mobileMaxPx: 750,
    tabletMaxPx: 1124,
});

export const designShellLayout = Object.freeze({
    defaultSpaceColumnWidthPx: 64,
    defaultRoomColumnWidthPx: 260,
    minSpaceColumnWidthPx: 52,
    maxSpaceColumnWidthPx: 96,
    minRoomColumnWidthPx: 220,
    maxRoomColumnWidthPx: 360,
    navRailButtonSizePx: 40,
    navRailSectionGapPx: 8,
    desktopPanelPaddingPx: 16,
    desktopPanelWidthPx: 320,
});

// Semantic color tokens.
//
// Values are references to the live theme's CSS custom properties — the
// canonical theme contract lives in
// `apps/blackout-client/src/app/styles/theme.css.ts`
// (`createThemeContract` + `exposeSemanticCustomProperties`), which swaps the
// concrete palette per active theme class (dark_canopy, light_grove, …).
//
// Owning the semantic→variable mapping here (rather than the concrete hex
// values) lets every consumer theme correctly off the same source of truth:
//   - `@blackout/ui` web primitives reference these in their `.css.ts`,
//   - the non-React `@blackout/gov` HTML shell references the same variable
//     names in its rendered markup.
export const designColors = Object.freeze({
    bgSurface: 'var(--bg-surface)',
    bgSurfaceHover: 'var(--bg-surface-hover)',
    bgNav: 'var(--bg-nav)',
    bgInput: 'var(--bg-input)',
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    accentPrimary: 'var(--accent-primary)',
    accentHover: 'var(--accent-hover)',
    accentMuted: 'var(--accent-muted)',
    borderDefault: 'var(--border-default)',
    borderActive: 'var(--border-active)',
    danger: 'var(--danger)',
    warning: 'var(--warning)',
    success: 'var(--success)',
});

// Typography scale. Sizes mirror the values already in use across the
// canonical client's inline styles (11/12/13 for labels/controls, 15/18 for
// emphasis); weights mirror the existing 400/500/600 usage.
export const designTypography = Object.freeze({
    fontSizeXsPx: 11,
    fontSizeSmPx: 12,
    fontSizeMdPx: 13,
    fontSizeLgPx: 15,
    fontSizeXlPx: 18,
    fontWeightRegular: '400',
    fontWeightMedium: '500',
    fontWeightSemibold: '600',
    lineHeightTight: 1.2,
    lineHeightNormal: 1.45,
});

// Corner-radius scale. Mirrors the radii already used by the boutique
// components and the client's inline styles (6/8/10 for controls, 999 pill).
export const designRadii = Object.freeze({
    smPx: 6,
    mdPx: 8,
    lgPx: 10,
    pillPx: 999,
});

