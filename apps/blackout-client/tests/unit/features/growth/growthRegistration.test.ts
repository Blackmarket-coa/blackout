import { describe, expect, it } from 'vitest';
import { buildRegistryRouteObjects } from '../../../../src/app/core/features/RegistryRouteList';

/**
 * Proves the growth feature modules surface their routes through the same
 * registry path the live router rebuilds from. Each surface gates on its own
 * flag (growthReferrals / growthAmbassadors / growthQuests) AND the shared
 * `growth.read` capability.
 */
const growthPaths = (
    flags: Record<string, boolean>,
    capabilities: string[] = ['growth.read']
) =>
    buildRegistryRouteObjects({ capabilities, flags } as never)
        .map((route) => route.path)
        .filter((path) => path.startsWith('/growth/'));

describe('growth feature registration', () => {
    it('registers all three routes when flags + capability are present', () => {
        const paths = growthPaths({
            growthReferrals: true,
            growthAmbassadors: true,
            growthQuests: true,
        });
        expect(paths).toEqual(
            expect.arrayContaining([
                '/growth/referrals',
                '/growth/ambassadors',
                '/growth/quests',
            ])
        );
    });

    it('gates each surface on its own flag', () => {
        expect(growthPaths({ growthReferrals: true })).toEqual(['/growth/referrals']);
        expect(growthPaths({ growthQuests: true })).toEqual(['/growth/quests']);
    });

    it('omits every growth route when the growth.read capability is missing', () => {
        expect(
            growthPaths(
                { growthReferrals: true, growthAmbassadors: true, growthQuests: true },
                []
            )
        ).toEqual([]);
    });
});
