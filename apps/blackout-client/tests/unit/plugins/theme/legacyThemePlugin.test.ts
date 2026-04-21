import { describe, expect, it } from 'vitest';
import { legacyThemePlugin } from '../../../../../src/app/plugins/theme/legacyThemePlugin';

describe('legacy theme override plugin', () => {
    it('defaults disabled for Cinny baseline-compatible theme behavior', () => {
        expect(legacyThemePlugin.id).toBe('theme.legacy-overrides');
        expect(legacyThemePlugin.isEnabled()).toBe(false);
    });

    it('implements plugin lifecycle contract', () => {
        const unregister = legacyThemePlugin.register();

        expect(typeof unregister).toBe('function');
        expect(() => legacyThemePlugin.unregister()).not.toThrow();
    });

    it('keeps monochrome filter reversible through plugin gate', () => {
        expect(legacyThemePlugin.applyMonochromeFilter(false)).toBe('');
        expect(legacyThemePlugin.applyMonochromeFilter(true)).toBe('');
    });
});
