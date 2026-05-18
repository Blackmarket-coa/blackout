import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated Playwright config for the navigation consistency audit. Kept
 * separate from the root smoke config so the audit can be invoked on its
 * own (`pnpm test:e2e:navigation`) and so it can opt out of the strict
 * console-error gate the smoke layer enforces — the audit deliberately
 * visits routes that may surface warnings under an unauthenticated
 * session.
 */
const PORT = Number.parseInt(process.env.E2E_PORT ?? '4173', 10);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const storageStatePath =
    process.env.BLACKOUT_AUDIT_STORAGE_STATE ??
    'audit/navigation/.playwright-state/storageState.json';

export default defineConfig({
    testDir: 'playwright/e2e/navigation-audit',
    outputDir: 'audit/navigation/playwright-results',
    globalSetup: './playwright/e2e/navigation-audit/global-setup.ts',
    reporter: process.env.CI
        ? [['github'], ['list']]
        : [['list'], ['html', { outputFolder: 'audit/navigation/playwright-html', open: 'never' }]],
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 1 : 2,
    use: {
        baseURL,
        viewport: { width: 1280, height: 800 },
        trace: 'on-first-retry',
        video: 'retain-on-failure',
        storageState: storageStatePath,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: `pnpm --filter @blackout/client exec vite preview --port ${PORT} --host 127.0.0.1 --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
