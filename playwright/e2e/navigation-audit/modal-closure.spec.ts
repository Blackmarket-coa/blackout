import { test } from '@playwright/test';
import { KNOWN_MODALS } from '../../../tools/audit-navigation/route-manifest';
import { assertModalClosed, isBootstrapGated, openModal, setViewport } from './helpers';

test.describe('modal closure invariants', () => {
    test.beforeEach(async ({ page, context }) => {
        // Flip the audit sentinel before any app code runs so the
        // AppShell's `__openModal` bridge wires up under production
        // preview builds (where `import.meta.env.DEV` is false).
        await context.addInitScript(() => {
            (window as unknown as { __BLACKOUT_AUDIT__: boolean }).__BLACKOUT_AUDIT__ = true;
        });
        await setViewport(page, 'desktop');
        await page.goto('/home/', { waitUntil: 'domcontentloaded' });
    });

    for (const modal of KNOWN_MODALS) {
        test(`Esc closes "${modal}" modal`, async ({ page }) => {
            test.skip(
                await isBootstrapGated(page),
                'bootstrap auth gate — AppShell not mounted, modal sweep needs a session'
            );
            const opened = await openModal(page, modal);
            // Skip rather than fail when the dev bridge has not been wired
            // (production builds, or a session where the modal is gated).
            test.skip(!opened, `window.__openModal(${modal}) unavailable`);
            await page.keyboard.press('Escape');
            await assertModalClosed(page, modal);
        });
    }
});
