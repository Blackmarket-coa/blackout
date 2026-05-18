import { test } from '@playwright/test';
import { KNOWN_MODALS } from '../../../tools/audit-navigation/route-manifest';
import { assertModalClosed, openModal, setViewport } from './helpers';

test.describe('modal closure invariants', () => {
    test.beforeEach(async ({ page }) => {
        await setViewport(page, 'desktop');
        await page.goto('/home/', { waitUntil: 'domcontentloaded' });
    });

    for (const modal of KNOWN_MODALS) {
        test(`Esc closes "${modal}" modal`, async ({ page }) => {
            const opened = await openModal(page, modal);
            // Skip rather than fail when the dev bridge has not been wired
            // (production builds, or a session where the modal is gated).
            test.skip(!opened, `window.__openModal(${modal}) unavailable`);
            await page.keyboard.press('Escape');
            await assertModalClosed(page, modal);
        });
    }
});
