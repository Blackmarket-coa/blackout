import { style } from '@vanilla-extract/css';

/**
 * The "aesthetic rupture": inside the Coliseum the palette deliberately breaks
 * from Blackout's solarpunk theme into raw brutalist crimson / ash / amber. We
 * scope it by overriding the semantic CSS custom properties on this wrapper, so
 * every descendant (which all read `var(--bg-surface)` etc.) picks up the
 * arena palette — and nothing outside the Coliseum subtree is affected.
 */
export const coliseumArenaTheme = style({
    vars: {
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
    },
    backgroundColor: 'var(--bg-nav)',
    color: 'var(--text-primary)',
    height: '100%',
    minHeight: 0,
    // No soft gradients, no organic curves — sharp edges only.
    borderRadius: 0,
});
