import { expect, test } from '@playwright/test';
import {
    assertModalOpen,
    bootAppShell,
    closeModal,
    openModal,
    setViewport,
    visibleDialogCount,
    withLatency,
} from './helpers';

test.describe('latency simulation', () => {
    test.beforeEach(async ({ page }) => {
        await setViewport(page, 'desktop');
    });

    test('reconnect + rapid click survive 2s injected latency on Matrix endpoints', async ({
        page,
        context,
    }) => {
        const ready = await bootAppShell(page);
        test.skip(!ready, 'bootstrap gate / AppShell not ready');

        // Inject latency before stressing — applies to subsequent sync
        // and send-event requests but not the modal bridge, which lives
        // entirely in-page.
        const dispose = await withLatency(page, 2_000, '**/_matrix/client/**');

        try {
            const opened = await openModal(page, 'createRoom');
            test.skip(!opened, '__openModal(createRoom) unavailable');

            // Burst opens while requests are delayed.
            await page.evaluate(() => {
                const open = (window as unknown as { __openModal: (n: string) => void }).__openModal;
                for (let i = 0; i < 4; i += 1) open('createRoom');
            });
            await assertModalOpen(page, 'createRoom');
            expect(await visibleDialogCount(page)).toBe(1);

            // Flap connectivity while delayed responses are still
            // in-flight; the modal must hold.
            await context.setOffline(true);
            await page.waitForTimeout(300);
            await context.setOffline(false);
            await assertModalOpen(page, 'createRoom');

            await closeModal(page, 'createRoom');
        } finally {
            await dispose();
        }
    });
});
