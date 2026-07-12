// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Executes the actual index.html pre-hydration script (extracted verbatim)
 * against jsdom to prove the boot behavior: the persisted theme's surface and
 * text colors land on <html> before the app bundle would, legacy ids
 * normalize, and unknown/corrupt storage falls back to the dark default.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const indexHtml = readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const bootScript = (() => {
    const scripts = indexHtml.match(/<script>([\s\S]*?)<\/script>/g) ?? [];
    const boot = scripts.find((tag) => tag.includes('BOOT_THEMES'));
    if (!boot) throw new Error('boot script not found in index.html');
    return boot.replace(/<\/?script>/g, '');
})();

const runBootScript = () => {
    // The script only touches window.localStorage, document.documentElement,
    // and document.querySelector — all provided by the jsdom test env.
    new Function('window', 'document', bootScript)(window, document);
};

describe('index.html theme boot behavior', () => {
    beforeEach(() => {
        window.localStorage.clear();
        const root = document.documentElement;
        delete root.dataset.theme;
        delete root.dataset.themeBoot;
        root.style.removeProperty('--bg-surface');
        root.style.removeProperty('--text-primary');
        document.head.querySelector('meta[name="theme-color"]')?.remove();
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        meta.setAttribute('content', '#000000');
        document.head.appendChild(meta);
    });

    it('paints the persisted theme before hydration', () => {
        window.localStorage.setItem(
            'blackout.settings.v1',
            JSON.stringify({ theme: 'light_grove' })
        );
        runBootScript();

        const root = document.documentElement;
        expect(root.dataset.theme).toBe('light_grove');
        expect(root.dataset.themeBoot).toBe('1');
        expect(root.style.getPropertyValue('--bg-surface')).toBe('#EFFFD1');
        expect(root.style.getPropertyValue('--text-primary')).toBe('#102017');
        expect(root.style.colorScheme).toBe('light');
        expect(
            document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')
        ).toBe('#EFFFD1');
    });

    it('falls back to the appearance store when the runtime store is absent', () => {
        window.localStorage.setItem(
            'blackout.settings.appearance.v1',
            JSON.stringify({ theme: 'amoled_night' })
        );
        runBootScript();

        expect(document.documentElement.dataset.theme).toBe('amoled_night');
        expect(document.documentElement.style.getPropertyValue('--bg-surface')).toBe('#000000');
    });

    it('normalizes legacy theme aliases', () => {
        window.localStorage.setItem('blackout.settings.v1', JSON.stringify({ theme: 'amoled' }));
        runBootScript();
        expect(document.documentElement.dataset.theme).toBe('amoled_night');
    });

    it('defaults to dark_canopy on fresh boot, unknown ids, and corrupt storage', () => {
        runBootScript();
        expect(document.documentElement.dataset.theme).toBe('dark_canopy');

        window.localStorage.setItem('blackout.settings.v1', JSON.stringify({ theme: 'neon_void' }));
        runBootScript();
        expect(document.documentElement.dataset.theme).toBe('dark_canopy');

        window.localStorage.setItem('blackout.settings.v1', '{not json');
        runBootScript();
        expect(document.documentElement.dataset.theme).toBe('dark_canopy');
        expect(document.documentElement.style.getPropertyValue('--bg-surface')).toBe('#0B0F10');
    });
});
