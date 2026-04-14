import { designSpacing } from '../../../../../../packages/design/src';

export type ReviewRegion = 'chat' | 'composer' | 'right-panel';

export type RegionLayout = {
    region: ReviewRegion;
    left: number;
    top: number;
    right: number;
    bottom: number;
};

export type LayoutIssue = {
    type: 'overlap' | 'crowding';
    regions: [ReviewRegion, ReviewRegion];
};

const overlaps = (a: RegionLayout, b: RegionLayout) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const horizontalGap = (a: RegionLayout, b: RegionLayout) =>
    Math.max(Math.max(a.left, b.left) - Math.min(a.right, b.right), 0);

const verticalGap = (a: RegionLayout, b: RegionLayout) =>
    Math.max(Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom), 0);

const gapBetween = (a: RegionLayout, b: RegionLayout) => {
    const h = horizontalGap(a, b);
    const v = verticalGap(a, b);
    if (h === 0) return v;
    if (v === 0) return h;
    return Math.min(h, v);
};

export function reviewRoomSurfaceLayout(
    regions: RegionLayout[],
    minGapPx: number = designSpacing.comfortableGapPx
): LayoutIssue[] {
    const issues: LayoutIssue[] = [];
    for (let index = 0; index < regions.length; index += 1) {
        for (let compareIndex = index + 1; compareIndex < regions.length; compareIndex += 1) {
            const a = regions[index];
            const b = regions[compareIndex];
            if (overlaps(a, b)) {
                issues.push({ type: 'overlap', regions: [a.region, b.region] });
                continue;
            }
            if (gapBetween(a, b) < minGapPx) {
                issues.push({ type: 'crowding', regions: [a.region, b.region] });
            }
        }
    }
    return issues;
}
