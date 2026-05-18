import { expect, test } from '@playwright/test';
import {
    assertModalOpen,
    bootAppShell,
    openModal,
    setViewport,
    simulateMobileKeyboard,
} from './helpers';

const MODALS = ['search', 'createRoom', 'createSpace'];

test.describe('popup + mobile keyboard', () => {
    test.beforeEach(async ({ page }) => {
        await setViewport(page, 'mobile');
    });

    for (const modal of MODALS) {
        test(`"${modal}" stays in view when the soft keyboard opens`, async ({ page }) => {
            const ready = await bootAppShell(page);
            test.skip(!ready, 'bootstrap gate / AppShell not ready');

            const opened = await openModal(page, modal);
            test.skip(!opened, `__openModal(${modal}) unavailable`);
            await assertModalOpen(page, modal);

            await simulateMobileKeyboard(page, { open: true, keyboardHeightPx: 320 });

            // The dialog must still be present; its bounding rect must
            // fall inside the visible (visualViewport) area on the Y
            // axis with the keyboard open.
            const stillVisible = await page.evaluate(() => {
                const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
                if (!dialog) return { visible: false } as const;
                const rect = dialog.getBoundingClientRect();
                const vv = window.visualViewport;
                const visibleHeight = vv?.height ?? window.innerHeight;
                return {
                    visible: true,
                    inside: rect.top < visibleHeight && rect.bottom > 0,
                    horizontalOverflow:
                        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
                            window.innerWidth >
                        2,
                } as const;
            });
            expect(stillVisible.visible, 'dialog DOM survived keyboard open').toBe(true);
            expect(stillVisible.inside, 'dialog has overlap with visible viewport').toBe(true);
            expect(
                stillVisible.horizontalOverflow,
                'no horizontal overflow appeared',
            ).toBe(false);

            // Closing the keyboard must restore state — neither stale
            // layout values nor a stuck modal.
            await simulateMobileKeyboard(page, { open: false });
            await assertModalOpen(page, modal);
        });
    }
});
