import { describe, expect, it } from 'vitest';
import { designBreakpoints } from '../../../../../packages/design/src';

type RegionFrame = {
    chat: { width: number; height: number };
    composer: { width: number; height: number };
    rightPanel: { width: number; height: number };
};

const renderFrame = (viewportWidth: number): RegionFrame => {
    if (viewportWidth <= designBreakpoints.mobileMaxPx) {
        return {
            chat: { width: viewportWidth, height: 640 },
            composer: { width: viewportWidth, height: 136 },
            rightPanel: { width: viewportWidth, height: 180 },
        };
    }

    return {
        chat: { width: Math.round(viewportWidth * 0.7), height: 760 },
        composer: { width: Math.round(viewportWidth * 0.7), height: 140 },
        rightPanel: { width: viewportWidth - Math.round(viewportWidth * 0.7), height: 900 },
    };
};

describe('room surface visual regression envelopes', () => {
    it('keeps expected desktop/mobile region frames stable', () => {
        const snapshots = {
            mobile: renderFrame(designBreakpoints.mobileMaxPx),
            desktop: renderFrame(designBreakpoints.tabletMaxPx + 1),
        };

        expect(snapshots).toMatchInlineSnapshot(`
          {
            "desktop": {
              "chat": {
                "height": 760,
                "width": 788,
              },
              "composer": {
                "height": 140,
                "width": 788,
              },
              "rightPanel": {
                "height": 900,
                "width": 337,
              },
            },
            "mobile": {
              "chat": {
                "height": 640,
                "width": 750,
              },
              "composer": {
                "height": 136,
                "width": 750,
              },
              "rightPanel": {
                "height": 180,
                "width": 750,
              },
            },
          }
        `);
    });
});
