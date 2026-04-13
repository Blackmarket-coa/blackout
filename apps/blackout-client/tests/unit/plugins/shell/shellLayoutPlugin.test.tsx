// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { shellLayoutPlugin } from '../../../../../src/app/plugins/shell/shellLayoutPlugin';

describe('shell layout plugin', () => {
    it('is disabled by default to preserve Cinny baseline shell parity', () => {
        expect(shellLayoutPlugin.id).toBe('shell.legacy-layout');
        expect(shellLayoutPlugin.isEnabled()).toBe(false);
    });

    it('exposes a lazy-rendered legacy layout boundary component', () => {
        const element = shellLayoutPlugin.renderLegacyLayout();

        expect(element.type).toBeDefined();
        expect(element.props.fallback).toBeNull();
    });
});
