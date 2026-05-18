import { expect, test } from '@playwright/test';
import { SHELL_ROOT_PATHS, WEB_ROUTES } from '../../../tools/audit-navigation/route-manifest';
import { isBootstrapGated, setViewport } from './helpers';

const isRoot = (path: string): boolean =>
    SHELL_ROOT_PATHS.includes(path.replace(/\/+$/, '') || '/') || path === '/' || path === '/home/';

for (const route of WEB_ROUTES) {
    if (route.chromeless || isRoot(route.path)) continue;
    test(`back navigation works — ${route.id}`, async ({ page }) => {
        await setViewport(page, 'desktop');
        // Push a known root first so the back stack has somewhere to return to.
        await page.goto('/home/', { waitUntil: 'domcontentloaded' });
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        // When the client is gated by the auth bootstrap, every URL
        // collapses to the same gate render and history navigation tests
        // nothing meaningful.
        test.skip(
            await isBootstrapGated(page),
            'bootstrap auth gate active — needs test session to exercise back nav'
        );
        const before = new URL(page.url()).pathname;
        await page.goBack({ waitUntil: 'domcontentloaded' });
        const after = new URL(page.url()).pathname;
        expect(after, `${route.path}: goBack() did not change URL`).not.toBe(before);
    });
}
