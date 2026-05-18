import { expect, test } from '@playwright/test';
import { bootAppShell, setViewport } from './helpers';

test.describe('plugins + navigation', () => {
    test.beforeEach(async ({ page }) => {
        await setViewport(page, 'desktop');
    });

    test('navigating away mid-mount leaves no orphan plugin iframes', async ({ page }) => {
        const ready = await bootAppShell(page);
        test.skip(!ready, 'bootstrap gate / AppShell not ready');

        const pluginBridge = await page.evaluate(() =>
            typeof (window as unknown as { __mountTestPlugin?: unknown }).__mountTestPlugin ===
            'function',
        );
        test.skip(
            !pluginBridge,
            'dev plugin bridge (__mountTestPlugin) unavailable — needs a live session with plugin host',
        );

        // Start the mount, navigate immediately, give the mount a beat
        // to settle, then assert no iframe remains.
        await page.evaluate(() => {
            (window as unknown as { __mountTestPlugin: () => void }).__mountTestPlugin();
        });
        await page.goto('/home/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(250);

        const orphanIframes = await page.locator('iframe[title^="plugin-sandbox-"]').count();
        expect(orphanIframes).toBe(0);
    });
});
