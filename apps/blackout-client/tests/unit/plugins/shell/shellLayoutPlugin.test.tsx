// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { shellLayoutPlugin } from '../../../../src/app/plugins/shell/shellLayoutPlugin';

describe('shell layout plugin', () => {
    it('reports the legacy fallback as permanently disabled (PR-10 retired the path)', () => {
        expect(shellLayoutPlugin.id).toBe('shell.legacy-layout');
        expect(shellLayoutPlugin.hasLegacyFallbackEnabled()).toBe(false);
        expect(shellLayoutPlugin.isEnabled()).toBe(false);
    });

    it('returns null from the legacy fallback render so stale callers fail closed', () => {
        expect(shellLayoutPlugin.renderLegacyFallbackLayout()).toBeNull();
        expect(shellLayoutPlugin.renderLegacyLayout()).toBeNull();
    });
});
