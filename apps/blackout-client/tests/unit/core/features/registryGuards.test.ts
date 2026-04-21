import { describe, expect, it } from 'vitest';
import { assertFeatureModulesRegistered } from '../../../../src/app/core/features/composition';
import type { FeatureModule } from '../../../../src/app/core/features/types';

describe('feature registration guards', () => {
    it('accepts modules that exist in the registration snapshot', () => {
        const modules: FeatureModule[] = [
            {
                feature: { id: 'governance', name: 'Governance' },
                flag: 'governance',
            },
        ];

        expect(() =>
            assertFeatureModulesRegistered(modules, ['governance', 'forum'], 'core')
        ).not.toThrow();
    });

    it('rejects modules that are not in the registration snapshot', () => {
        const modules: FeatureModule[] = [
            {
                feature: { id: 'rogue-module', name: 'Rogue Module' },
            },
        ];

        expect(() =>
            assertFeatureModulesRegistered(modules, ['governance', 'forum'], 'plugin')
        ).toThrow(/rogue-module/);
    });
});
