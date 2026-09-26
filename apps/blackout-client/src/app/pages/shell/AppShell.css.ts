import { style } from '@vanilla-extract/css';

/**
 * Pin the shell to the *visible* viewport. `html`/`body` are
 * `overflow: hidden`, so the document never scrolls; a `100vh` root on mobile
 * browsers resolves to the large viewport and pushes the bottom tab bar
 * underneath the browser's own bottom toolbar. `100dvh` tracks the toolbar;
 * `100vh` is the fallback for browsers without dynamic viewport units.
 */
export const root = style({
    height: ['100vh', '100dvh'],
    overflow: 'hidden',
});
