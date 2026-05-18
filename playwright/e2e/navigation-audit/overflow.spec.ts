import { test } from '@playwright/test';
import { WEB_ROUTES } from '../../../tools/audit-navigation/route-manifest';
import { expectNoOverflow, setViewport, type ViewportName } from './helpers';

const VIEWPORTS: ViewportName[] = ['mobile', 'tablet', 'desktop'];

for (const route of WEB_ROUTES) {
    for (const viewport of VIEWPORTS) {
        test(`no hidden overflow — ${route.id} @ ${viewport}`, async ({ page }) => {
            await setViewport(page, viewport);
            await page.goto(route.path, { waitUntil: 'domcontentloaded' });
            await expectNoOverflow(page);
        });
    }
}
