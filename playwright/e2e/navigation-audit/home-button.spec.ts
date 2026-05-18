import { test } from '@playwright/test';
import { WEB_ROUTES } from '../../../tools/audit-navigation/route-manifest';
import {
    expectHomeButtonVisible,
    isBootstrapGated,
    setViewport,
    type ViewportName,
} from './helpers';

const VIEWPORTS: ViewportName[] = ['mobile', 'tablet', 'desktop'];

for (const route of WEB_ROUTES) {
    if (route.chromeless) continue;
    for (const viewport of VIEWPORTS) {
        test(`home button visible — ${route.id} @ ${viewport}`, async ({ page }) => {
            await setViewport(page, viewport);
            await page.goto(route.path, { waitUntil: 'domcontentloaded' });
            // The bootstrap gate still satisfies the home invariant via
            // its `data-testid="bootstrap-home"` anchor, but every other
            // route resolves to the same gate when no session exists.
            // expectHomeButtonVisible already accepts that selector, so
            // we run the assertion uniformly.
            await expectHomeButtonVisible(page);
        });
    }
}

test('bootstrap auth gate exposes a Home affordance', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    test.skip(!(await isBootstrapGated(page)), 'AppShell mounted — gate not visible');
    await expectHomeButtonVisible(page);
});
