import { describe, expect, it } from 'vitest';
import { tooltipWidthFor } from './HomeTourOverlay';

/**
 * The tour tooltip was a flat 360px. On a 320px phone that overhung the screen
 * by 40px, and the placement clamp could not save it because it clamped
 * against the same fixed 360. These pin the derived width so the regression
 * cannot come back.
 */
describe('tooltipWidthFor', () => {
    it('fits within the common phone widths, with margin', () => {
        for (const width of [320, 360, 375, 390, 414]) {
            expect(tooltipWidthFor(width), `overhangs at ${width}px`).toBeLessThanOrEqual(
                width - 32
            );
        }
    });

    it('keeps the roomy 360px cap on desktop', () => {
        expect(tooltipWidthFor(1280)).toBe(360);
        expect(tooltipWidthFor(1920)).toBe(360);
    });

    it('never collapses below a readable floor on absurdly narrow viewports', () => {
        expect(tooltipWidthFor(200)).toBe(240);
        expect(tooltipWidthFor(0)).toBe(240);
    });

    it('is monotonic in viewport width', () => {
        const widths = [200, 320, 375, 414, 600, 1280];
        const results = widths.map(tooltipWidthFor);
        expect(results).toEqual([...results].sort((a, b) => a - b));
    });
});
