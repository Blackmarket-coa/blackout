import { expect, test } from '@playwright/test';

// Regression pin for the create-room / create-space wizard overlay.
// Three rounds of fixes layered inline z-index/portal/backdrop hacks on
// top of folds' Overlay and still didn't keep the wizard above the
// WelcomeScreen. After replacing folds' Overlay with the hand-rolled
// PortalModal primitive, this spec drives that primitive in a real
// browser against /__dev__/portal-modal (see src/app/dev/PortalModalHarness.tsx
// and src/main.tsx) so the regression cannot silently come back.

test.describe('PortalModal overlay primitive', () => {
    test('renders above page content, captures clicks, and dismisses on backdrop click', async ({
        page,
    }) => {
        await page.goto('/__dev__/portal-modal', { waitUntil: 'domcontentloaded' });

        const bgBtn = page.getByTestId('page-bg-btn');
        await expect(bgBtn).toBeVisible();
        await expect(bgBtn).toHaveText(/clicks: 0/);

        // Open the modal.
        await page.getByTestId('harness-open').click();
        const dialog = page.getByTestId('harness-dialog');
        await expect(dialog).toBeVisible();

        const backdrop = page.getByTestId('harness-backdrop');
        await expect(backdrop).toBeVisible();

        // The backdrop is fixed-position, dimmed, and the overlay root sits
        // at zIndex 9999. Read both from computed style so a future regression
        // that drops the inline style trips here.
        const overlayShape = await backdrop.evaluate((el) => {
            const root = el.parentElement as HTMLElement;
            const rootStyle = getComputedStyle(root);
            const backStyle = getComputedStyle(el);
            return {
                rootPosition: rootStyle.position,
                rootZIndex: rootStyle.zIndex,
                backBackground: backStyle.backgroundColor,
                backPointerEvents: backStyle.pointerEvents,
            };
        });
        expect(overlayShape.rootPosition).toBe('fixed');
        expect(overlayShape.rootZIndex).toBe('9999');
        // rgba(0, 0, 0, 0.55) — allow a small float drift.
        expect(overlayShape.backBackground).toMatch(/rgba\(0,\s*0,\s*0,\s*0?\.5\d?\)/);
        expect(overlayShape.backPointerEvents).toBe('auto');

        // A click at the centre of the modal must hit a node inside the dialog,
        // not the underlying page background button. This is the assertion the
        // earlier band-aid fixes silently failed: pointer events leaked past
        // the backdrop straight to the WelcomeScreen behind.
        const hitInsideDialog = await page.evaluate(() => {
            const dlg = document.querySelector('[data-testid="harness-dialog"]');
            if (!dlg) return false;
            const r = dlg.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const stack = document.elementsFromPoint(cx, cy);
            return stack.some((node) => dlg.contains(node) || node === dlg);
        });
        expect(hitInsideDialog).toBe(true);

        // Click the modal's own button: counter should jump by 100, proving
        // the click reached the modal and was not swallowed by the backdrop.
        await page.getByTestId('harness-dialog-btn').click();
        await expect(bgBtn).toHaveText(/clicks: 100/);

        // A click at the page edge lands on the backdrop, not on the dialog
        // (which is centered) and not on the bg button (which is inside the
        // centered card). That click must close the modal AND must not
        // increment the bg button counter — the backdrop is opaque to
        // pointer events the way a modal demands.
        await page.mouse.click(8, 8);
        await expect(dialog).toBeHidden();
        await expect(bgBtn).toHaveText(/clicks: 100/);
    });
});
