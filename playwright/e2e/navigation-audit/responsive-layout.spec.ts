import { expect, test } from '@playwright/test';
import { SHELL_ROOT_PATHS } from '../../../tools/audit-navigation/route-manifest';
import { isBootstrapGated, setViewport, type ViewportName } from './helpers';

const VIEWPORTS: ViewportName[] = ['mobile', 'tablet', 'desktop'];

for (const root of SHELL_ROOT_PATHS) {
    for (const viewport of VIEWPORTS) {
        test(`AppShell renders ${root} @ ${viewport}`, async ({ page }) => {
            await setViewport(page, viewport);
            await page.goto(root, { waitUntil: 'domcontentloaded' });
            // No Matrix session in CI preview → bootstrap gate replaces
            // the AppShell. The gate's own responsive behaviour is
            // exercised by `bootstrap-gate.spec.ts`.
            test.skip(
                await isBootstrapGated(page),
                'bootstrap auth gate — AppShell does not mount without a session'
            );
            const shell = page.locator('[data-shell="app"]').first();
            await expect(shell).toBeVisible({ timeout: 10_000 });
            // The mobile shell should mount its chrome regions; the desktop
            // shell should not — this is the cheapest signal that the
            // responsive switch in AppShell did the right thing.
            const region = viewport === 'mobile' ? 'bottom-tab-bar' : 'mobile-top-bar';
            const shouldExist = viewport === 'mobile';
            const found = (await page.locator(`[data-shell-region="${region}"]`).count()) > 0;
            expect(found, `${region} at ${viewport} on ${root}`).toBe(shouldExist);
        });
    }
}
