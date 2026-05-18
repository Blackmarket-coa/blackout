import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';

/**
 * Seeds a Matrix session for the navigation-audit Playwright run by
 * driving the canonical login form once and persisting the resulting
 * `storageState` to a gitignored fixture path. The same selectors are
 * used as the launch-smoke auth spec
 * (`playwright/e2e/launch-smoke/auth.spec.ts`) so the two stay in lock-
 * step when the login UX evolves.
 *
 * When `BLACKOUT_E2E_HOMESERVER_URL` is unset (e.g. local dev without a
 * Matrix stack), writes an empty storageState so Playwright still loads
 * a context but every spec falls back to the existing `isBootstrapGated`
 * skip path. CI is expected to provide a working homeserver via the
 * companion composite action.
 */

const STORAGE_STATE_PATH =
    process.env.BLACKOUT_AUDIT_STORAGE_STATE ??
    'audit/navigation/.playwright-state/storageState.json';

const writeEmptyState = (path: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ cookies: [], origins: [] }, null, 2));
};

const globalSetup = async (config: FullConfig): Promise<void> => {
    const homeserver = process.env.BLACKOUT_E2E_HOMESERVER_URL;
    const username = process.env.LS_AUTH_USERNAME;
    const password = process.env.LS_AUTH_PASSWORD;

    if (!homeserver || !username || !password) {
        // eslint-disable-next-line no-console
        console.log(
            '[nav-audit] BLACKOUT_E2E_HOMESERVER_URL/LS_AUTH_USERNAME/LS_AUTH_PASSWORD ' +
                'not set — writing empty storageState. Specs will use the bootstrap-gate ' +
                'fallback (isBootstrapGated()).'
        );
        writeEmptyState(STORAGE_STATE_PATH);
        return;
    }

    const baseURL =
        config.projects[0]?.use?.baseURL ??
        process.env.E2E_BASE_URL ??
        `http://127.0.0.1:${process.env.E2E_PORT ?? '4173'}`;

    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.getByLabel(/username/i).fill(username);
        await page.getByLabel(/password/i).fill(password);
        await page.getByRole('button', { name: /sign in|log in/i }).click();
        // The post-login navigation should leave any /login route and
        // surface the AppShell (data-shell="app"). Wait for that handoff
        // before snapshotting storage.
        await page.waitForURL((url) => !/\/login/i.test(url.pathname), {
            timeout: 30_000,
        });
        await page.locator('[data-shell="app"]').first().waitFor({ timeout: 30_000 });
        mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
        await context.storageState({ path: STORAGE_STATE_PATH });
    } catch (cause) {
        // eslint-disable-next-line no-console
        console.warn(
            '[nav-audit] login failed — falling back to empty storageState. Specs ' +
                `will report the bootstrap gate as the only audited surface. (${
                    (cause as Error).message
                })`
        );
        writeEmptyState(STORAGE_STATE_PATH);
    } finally {
        await context.close();
        await browser.close();
    }
};

export default globalSetup;
