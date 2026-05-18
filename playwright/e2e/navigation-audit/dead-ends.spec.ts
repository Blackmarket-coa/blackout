import { test } from '@playwright/test';
import { WEB_ROUTES } from '../../../tools/audit-navigation/route-manifest';
import { expectNotDeadEnd, setViewport, type ViewportName } from './helpers';

const VIEWPORTS: ViewportName[] = ['mobile', 'desktop'];

for (const route of WEB_ROUTES) {
    if (route.chromeless) continue;
    for (const viewport of VIEWPORTS) {
        test(`no dead end — ${route.id} @ ${viewport}`, async ({ page }) => {
            await setViewport(page, viewport);
            await page.goto(route.path, { waitUntil: 'domcontentloaded' });
            await expectNotDeadEnd(page);
        });
    }
}
