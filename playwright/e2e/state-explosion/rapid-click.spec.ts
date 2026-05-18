import { expect, test } from '@playwright/test';
import {
    assertModalClosed,
    assertModalOpen,
    bootAppShell,
    closeModal,
    openModal,
    setViewport,
    visibleDialogCount,
} from './helpers';

test.describe('rapid clicking on modal openers', () => {
    test.beforeEach(async ({ page }) => {
        await setViewport(page, 'desktop');
    });

    test('8 rapid __openModal calls produce a single visible dialog', async ({ page }) => {
        const ready = await bootAppShell(page);
        test.skip(!ready, 'bootstrap gate / AppShell not ready');

        // Burst the audit bridge — equivalent to a user mashing the
        // open button. Pre-fix this would land 8 distinct payload
        // objects into createRoomModalAtom and force 8 child renders.
        const success = await page.evaluate(() => {
            const open = (window as unknown as { __openModal?: (n: string) => void }).__openModal;
            if (!open) return false;
            for (let i = 0; i < 8; i += 1) open('createRoom');
            return true;
        });
        test.skip(!success, '__openModal unavailable');

        await assertModalOpen(page, 'createRoom');
        expect(await visibleDialogCount(page)).toBe(1);

        // Closing once must actually close — the close path can't be
        // shadowed by leftover open state from the burst.
        await closeModal(page, 'createRoom');
        await assertModalClosed(page, 'createRoom');
    });

    test('repeated open/close cycles do not leak listeners', async ({ page }) => {
        const ready = await bootAppShell(page);
        test.skip(!ready, 'bootstrap gate / AppShell not ready');

        for (let i = 0; i < 10; i += 1) {
            const opened = await openModal(page, 'search');
            if (!opened) {
                test.skip(true, '__openModal(search) unavailable');
                return;
            }
            await assertModalOpen(page, 'search');
            await closeModal(page, 'search');
            await assertModalClosed(page, 'search');
        }

        expect(await visibleDialogCount(page)).toBe(0);
    });
});
