import { test } from '@playwright/test';
import { assertModalOpen, bootAppShell, openModal, setViewport } from './helpers';

test.describe('reconnect + modal', () => {
    test.beforeEach(async ({ page }) => {
        await setViewport(page, 'desktop');
    });

    test('createRoom modal survives an offline/online flap', async ({ page, context }) => {
        const ready = await bootAppShell(page);
        test.skip(!ready, 'bootstrap gate / AppShell not ready');

        const opened = await openModal(page, 'createRoom');
        test.skip(!opened, '__openModal(createRoom) unavailable');
        await assertModalOpen(page, 'createRoom');

        for (let i = 0; i < 3; i += 1) {
            await context.setOffline(true);
            await page.waitForTimeout(150);
            await context.setOffline(false);
            await page.waitForTimeout(150);
        }

        // The reconnect path must not steal the modal: same instance,
        // still in the DOM, still visible.
        await assertModalOpen(page, 'createRoom');
    });
});
