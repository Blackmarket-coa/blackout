import { test } from '@playwright/test';
import { WEB_ROUTES } from '../../../tools/audit-navigation/route-manifest';
import { expectNotDeadEnd, setViewport, type ViewportName } from './helpers';

const VIEWPORTS: ViewportName[] = ['mobile', 'desktop'];

// When the client is gated by the bootstrap auth screen, every route
// collapses to the same surface; the gate's own dead-end behaviour is
// covered by the bootstrap-* anchors emitted in `BootstrapStatus`. The
// `expectNotDeadEnd` helper already accepts those anchors, so the spec
// runs uniformly.

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
