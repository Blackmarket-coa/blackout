import { describe, expect, it } from 'vitest';
import { designBreakpoints, designShellLayout } from '../../../../../../packages/design/src';
import { clientShellLayoutMetrics, isMobileViewport, isTabletViewport } from './layoutMetrics';
import { buildCommunitiesPath, COMMUNITIES_PATH } from '../paths';

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

    it('reproduces the legacy /room/:roomId shape when the canopy is unknown', () => {
        // The AppShell-canonical canopy/den path with a sentinel "-"
        // canopy stands in for the legacy "no parent space" room. The
        // den segment is encoded the same way the legacy /room/:roomId
        // route encoded :roomId, so deep-link routing parity holds.
        const denId = '!den:server';
        const next = buildCommunitiesPath(null, denId);
        expect(next).toBe(`${COMMUNITIES_PATH}/-/dens/${encodeURIComponent(denId)}`);
        const [, , canopySegment, , denSegment] = next.split('/');
        expect(canopySegment).toBe('-');
        expect(decodeURIComponent(denSegment)).toBe(denId);
    });
});
