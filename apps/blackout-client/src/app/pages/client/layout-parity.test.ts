import { describe, expect, it } from 'vitest';
import { designBreakpoints, designShellLayout } from '../../../../../../packages/design/src';
import { clientShellLayoutMetrics, isMobileViewport, isTabletViewport } from './layoutMetrics';

describe('client shell layout parity', () => {
    it('uses shared breakpoints for shell collapse behavior', () => {
        expect(isMobileViewport(designBreakpoints.mobileMaxPx)).toBe(true);
        expect(isMobileViewport(designBreakpoints.mobileMaxPx + 1)).toBe(false);
        expect(isTabletViewport(designBreakpoints.tabletMaxPx)).toBe(true);
        expect(isTabletViewport(designBreakpoints.tabletMaxPx + 1)).toBe(false);
    });

    it('keeps rail touch target at design token minimum', () => {
        expect(clientShellLayoutMetrics.minTouchTargetPx).toBe(
            designShellLayout.navRailButtonSizePx
        );
        expect(clientShellLayoutMetrics.minTouchTargetPx).toBeGreaterThanOrEqual(40);
    });
});
