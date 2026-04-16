import {
    designBreakpoints,
    designShellLayout,
    designSpacing,
} from '../../../../../../packages/design/src';

export const roomViewBaselineControlLayout = Object.freeze({
    timelineRegion: 'top',
    composerRegion: 'bottom',
});

export const roomViewLayoutRhythm = Object.freeze({
    timelineHorizontalPaddingPx: designSpacing.comfortableGapPx,
    timelineBottomPaddingPx: designShellLayout.navRailButtonSizePx + designSpacing.comfortableGapPx,
    timelineTopPaddingPx: designSpacing.comfortableGapPx,
    composerHorizontalPaddingPx: designShellLayout.desktopPanelPaddingPx,
    minTouchTargetPx: designShellLayout.navRailButtonSizePx,
    mobileMaxWidthPx: designBreakpoints.mobileMaxPx,
});

export type RoomViewBaselineControlLayout = typeof roomViewBaselineControlLayout;
