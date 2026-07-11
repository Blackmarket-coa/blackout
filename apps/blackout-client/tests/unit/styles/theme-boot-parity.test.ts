import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { themeColorSchemeByPreference, themeTokenMap } from '../../../src/app/styles/theme-engine';
import { normalizeThemeId } from '../../../src/lib/bmc-core';

/**
 * The index.html pre-hydration guard carries its own copy of each theme's
 * boot-critical colors (it runs before any bundle loads, so it can't import
 * theme-engine.ts). These tests are the sync contract: if a theme's surface or
 * primary text color changes, a theme is added/removed, a legacy alias
 * changes, or a settings storage key moves, one of these assertions fails and
 * points at the inline script.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const indexHtml = readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const extractLiteral = <T>(varName: string): T => {
    const match = indexHtml.match(new RegExp(`var ${varName} = (\\{[\\s\\S]*?\\});`));
    if (!match) throw new Error(`${varName} literal not found in index.html`);
    // Evaluate the JS object literal rather than JSON.parse so the assertion
    // survives formatter rewrites (quote style, unquoted keys).
    return new Function(`return ${match[1]};`)() as T;
};

type BootTheme = { bg: string; text: string; scheme: string };

const bootThemes = extractLiteral<Record<string, BootTheme>>('BOOT_THEMES');
const bootLegacy = extractLiteral<Record<string, string>>('BOOT_LEGACY');

describe('index.html theme boot guard parity', () => {
    it('covers exactly the theme ids the engine knows', () => {
        expect(Object.keys(bootThemes).sort()).toEqual(Object.keys(themeTokenMap).sort());
    });

    it('matches each theme’s surface color, text color, and color scheme', () => {
        for (const [id, tokens] of Object.entries(themeTokenMap)) {
            const boot = bootThemes[id];
            expect(boot, `BOOT_THEMES entry for ${id}`).toBeDefined();
            expect(boot.bg, `${id} surface`).toBe(tokens.bg.surface);
            expect(boot.text, `${id} text`).toBe(tokens.text.primary);
            expect(boot.scheme, `${id} scheme`).toBe(
                themeColorSchemeByPreference[id as keyof typeof themeColorSchemeByPreference]
            );
        }
    });

    it('maps legacy theme ids the same way normalizeThemeId does', () => {
        for (const [legacy, modern] of Object.entries(bootLegacy)) {
            expect(normalizeThemeId(legacy), `legacy alias ${legacy}`).toBe(modern);
        }
    });

    it('reads the same storage keys the settings atoms persist to', () => {
        const settingsSource = readFileSync(
            path.join(rootDir, 'src/app/state/settings.ts'),
            'utf8'
        );
        const appearanceSource = readFileSync(
            path.join(rootDir, 'src/app/features/settings/settingsAtoms.ts'),
            'utf8'
        );

        expect(indexHtml).toContain("'blackout.settings.v1'");
        expect(indexHtml).toContain("'blackout.settings.appearance.v1'");
        expect(settingsSource).toContain("'blackout.settings.v1'");
        expect(appearanceSource).toContain("'blackout.settings.appearance.v1'");
    });

    it('falls back to dark_canopy for unknown ids (default id present)', () => {
        expect(bootThemes.dark_canopy).toBeDefined();
        expect(indexHtml).toContain("if (!BOOT_THEMES[id]) id = 'dark_canopy';");
    });
});
