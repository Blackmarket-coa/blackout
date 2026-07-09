import { style } from '@vanilla-extract/css';

/**
 * The "aesthetic rupture": inside the Coliseum the palette deliberately breaks
 * from Blackout's solarpunk theme into raw brutalist crimson / ash / amber. We
 * scope it by overriding the semantic CSS custom properties on this wrapper, so
 * every descendant (which all read `var(--bg-surface)` etc.) picks up the
 * arena palette — and nothing outside the Coliseum subtree is affected.
 */
const arenaVars = {
    '--bg-surface': '#15100f',
    '--bg-surface-hover': '#221917',
    '--bg-nav': '#0e0a09',
    '--bg-input': '#1c1513',
    '--text-primary': '#f3ece9',
    '--text-secondary': '#b9a8a2',
    '--text-muted': '#8a7872',
    '--accent-primary': '#b3122a', // deep crimson
    '--accent-hover': '#d11d36',
    '--accent-muted': '#5e2a2a',
    '--border-default': '#3a2a27', // ash
    '--border-active': '#e0a23c', // amber
    '--danger': '#ff5247',
    '--warning': '#e0a23c',
    '--success': '#c98b2e',
};

export const coliseumArenaTheme = style({
    vars: arenaVars,
    backgroundColor: 'var(--bg-nav)',
    color: 'var(--text-primary)',
    height: '100%',
    minHeight: 0,
    // No soft gradients, no organic curves — sharp edges only.
    borderRadius: 0,
});

/**
 * Same palette for surfaces that portal OUTSIDE the Coliseum subtree (bottom
 * sheets render on document.body, where the arena vars — and, in bare hosts,
 * any semantic vars at all — are not defined). No layout overrides.
 */
export const coliseumSheetTheme = style({
    vars: arenaVars,
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
});
