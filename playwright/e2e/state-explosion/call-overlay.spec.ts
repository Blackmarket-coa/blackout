import { expect, test } from '@playwright/test';
import {
    assertModalOpen,
    bootAppShell,
    isBootstrapGated,
    openModal,
    setViewport,
} from './helpers';

test.describe('voice chat + overlays', () => {
    test.beforeEach(async ({ page }) => {
        await setViewport(page, 'desktop');
    });

    test('overlay opened mid-call does not spawn a second MediaStream', async ({ page }) => {
        const ready = await bootAppShell(page);
        test.skip(!ready || (await isBootstrapGated(page)), 'live session required');

        const callBridge = await page.evaluate(() =>
            typeof (window as unknown as { __callJoin?: unknown }).__callJoin === 'function',
        );
        test.skip(!callBridge, 'dev call bridge (__callJoin) unavailable — needs a live session');

        // Track the count of MediaStream-equivalent acquisitions.
        await page.evaluate(() => {
            const md = navigator.mediaDevices;
            if (!md) return;
            const original = md.getUserMedia.bind(md);
            (window as unknown as { __gumCalls?: number }).__gumCalls = 0;
            md.getUserMedia = (constraints) => {
                (window as unknown as { __gumCalls: number }).__gumCalls += 1;
                return original(constraints);
            };
        });

        await page.evaluate(() => {
            const join = (window as unknown as { __callJoin: () => Promise<void> }).__callJoin;
            return join();
        });

        const opened = await openModal(page, 'search');
        test.skip(!opened, '__openModal(search) unavailable');
        await assertModalOpen(page, 'search');

        const gumCalls = await page.evaluate(
            () => (window as unknown as { __gumCalls?: number }).__gumCalls ?? 0,
        );
        expect(gumCalls).toBeLessThanOrEqual(1);
    });
});
