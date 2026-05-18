import { expect, test } from '@playwright/test';
import {
    assertModalOpen,
    bootAppShell,
    openModal,
    setViewport,
    trackConsoleErrors,
} from './helpers';

test.describe('resizing during transitions', () => {
    test.beforeEach(async ({ page }) => {
        await setViewport(page, 'desktop');
    });

    test('mid-transition desktop -> mobile resize does not corrupt the shell', async ({
        page,
    }) => {
        const ready = await bootAppShell(page);
        test.skip(!ready, 'bootstrap gate / AppShell not ready');

        const console = trackConsoleErrors(page);
        try {
            const opened = await openModal(page, 'createRoom');
            test.skip(!opened, '__openModal(createRoom) unavailable');

            // Fire the resize before waiting for the modal's open
            // animation to settle — this is the regime that triggers
            // the bug (visualViewport + ResizeObserver firing inside
            // an in-flight transition).
            await Promise.all([
                assertModalOpen(page, 'createRoom'),
                setViewport(page, 'mobile'),
            ]);

            // Shell must reflect the new viewport and the modal must
            // still be present.
            const shellViewport = await page
                .locator('[data-shell="app"]')
                .first()
                .getAttribute('data-shell-viewport');
            expect(shellViewport).toBe('mobile');
            await assertModalOpen(page, 'createRoom');
        } finally {
            console.stop();
        }

        // No console errors thrown during the transition.
        expect(
            console.errors,
            `console errors during transition: ${console.errors.join(' | ')}`,
        ).toHaveLength(0);
    });
});
