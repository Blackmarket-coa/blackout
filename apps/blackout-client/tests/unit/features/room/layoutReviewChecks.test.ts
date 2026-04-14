import { describe, expect, it } from 'vitest';
import { designBreakpoints, designSpacing } from '../../../../../../packages/design/src';
import { reviewRoomSurfaceLayout } from '../../../../src/app/features/room/layoutReviewChecks';

describe('room surface review checks', () => {
    it('flags overlap/crowding across chat, composer, and right-panel regions', () => {
        const issues = reviewRoomSurfaceLayout([
            { region: 'chat', left: 0, top: 0, right: 800, bottom: 760 },
            { region: 'composer', left: 0, top: 760, right: 800, bottom: 920 },
            { region: 'right-panel', left: 790, top: 0, right: 1200, bottom: 920 },
        ]);

        expect(issues).toEqual([
            { type: 'crowding', regions: ['chat', 'composer'] },
            { type: 'overlap', regions: ['chat', 'right-panel'] },
            { type: 'overlap', regions: ['composer', 'right-panel'] },
        ]);
    });

    it('passes desktop/mobile review envelopes with design-token spacing and breakpoints', () => {
        const desktopIssues = reviewRoomSurfaceLayout([
            { region: 'chat', left: 0, top: 0, right: 920, bottom: 820 },
            { region: 'composer', left: 0, top: 832, right: 920, bottom: 1000 },
            { region: 'right-panel', left: 936, top: 0, right: 1280, bottom: 1000 },
        ]);

        const mobileIssues = reviewRoomSurfaceLayout([
            { region: 'chat', left: 0, top: 0, right: designBreakpoints.mobileMaxPx, bottom: 640 },
            {
                region: 'composer',
                left: 0,
                top: 640 + designSpacing.comfortableGapPx,
                right: designBreakpoints.mobileMaxPx,
                bottom: 780,
            },
            {
                region: 'right-panel',
                left: 0,
                top: 780 + designSpacing.comfortableGapPx,
                right: designBreakpoints.mobileMaxPx,
                bottom: 980,
            },
        ]);

        expect(desktopIssues).toEqual([]);
        expect(mobileIssues).toEqual([]);
    });
});
