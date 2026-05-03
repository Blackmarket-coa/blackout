// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { shellLayoutPlugin } from '../../../../src/app/plugins/shell/shellLayoutPlugin';

describe('shell layout plugin', () => {
    it('is disabled by default to preserve default shell composition parity', () => {
        expect(shellLayoutPlugin.id).toBe('shell.legacy-layout');
        expect(shellLayoutPlugin.hasLegacyFallbackEnabled()).toBe(false);
        expect(shellLayoutPlugin.isEnabled()).toBe(false);
    });

    it('exposes a lazy-rendered legacy fallback layout boundary component', () => {
        const element = shellLayoutPlugin.renderLegacyFallbackLayout();

        expect(element.type).toBeDefined();
        expect(element.props.fallback).toBeNull();
    });
});
