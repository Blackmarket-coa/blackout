import {
    designBreakpoints,
    designShellLayout,
    designSpacing,
} from '../../../../../../packages/design/src';

export const clientShellLayoutMetrics = Object.freeze({
    mobileMaxWidthPx: designBreakpoints.mobileMaxPx,
    tabletMaxWidthPx: designBreakpoints.tabletMaxPx,
    panelGapPx: designSpacing.comfortableGapPx,
    denseGapPx: designSpacing.denseGapPx,
    minTouchTargetPx: designShellLayout.navRailButtonSizePx,
});

export const isTabletViewport = (width: number): boolean =>
    width <= clientShellLayoutMetrics.tabletMaxWidthPx;

export const isMobileViewport = (width: number): boolean =>
    width <= clientShellLayoutMetrics.mobileMaxWidthPx;
