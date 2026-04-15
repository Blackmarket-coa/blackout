import { describe, expect, it } from 'vitest';
import { designShellLayout, designSpacing } from '../../../../../../packages/design/src';
import { reviewRoomSurfaceLayout } from './layoutReviewChecks';
import { roomViewLayoutRhythm } from './roomViewLayoutContract';

describe('room layout review checks', () => {
    it('passes canonical chat/timeline/composer/right-panel spacing', () => {
        const issues = reviewRoomSurfaceLayout([
            { region: 'chat', left: 0, top: 0, right: 700, bottom: 500 },
            {
                region: 'composer',
                left: 0,
                top: 500 + designSpacing.comfortableGapPx,
                right: 700,
                bottom: 640,
            },
            {
                region: 'right-panel',
                left: 700 + designSpacing.comfortableGapPx,
                top: 0,
                right: 980,
                bottom: 640,
            },
        ]);

        expect(issues).toEqual([]);
    });

    it('flags spacing drift so regression tests catch crowding early', () => {
        const issues = reviewRoomSurfaceLayout([
            { region: 'chat', left: 0, top: 0, right: 700, bottom: 500 },
            { region: 'composer', left: 0, top: 506, right: 700, bottom: 620 },
            { region: 'right-panel', left: 708, top: 0, right: 980, bottom: 620 },
        ]);

        expect(issues).toEqual(
            expect.arrayContaining([
                { type: 'crowding', regions: ['chat', 'composer'] },
                { type: 'crowding', regions: ['chat', 'right-panel'] },
            ])
        );
    });

    it('keeps room rhythm and touch targets aligned with design tokens', () => {
        expect(roomViewLayoutRhythm.timelineHorizontalPaddingPx).toBe(
            designSpacing.comfortableGapPx
        );
        expect(roomViewLayoutRhythm.composerHorizontalPaddingPx).toBe(
            designShellLayout.desktopPanelPaddingPx
        );
        expect(roomViewLayoutRhythm.minTouchTargetPx).toBe(designShellLayout.navRailButtonSizePx);
    });
});
