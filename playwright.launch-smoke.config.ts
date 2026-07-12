import { defineConfig, devices } from '@playwright/test';

// Dedicated config for the live-stack smoke layers under `playwright/e2e/`
// (launch-smoke LS-* cases + the Coliseum Coalition smoke). The repo-root
// playwright.config.ts only discovers apps/blackout-client/tests/e2e, so
// these specs need their own entry point — without one,
// `playwright test playwright/e2e/launch-smoke` silently matched 0 tests.
//
// These specs target an already-running stack (dev server or staging);
// point BLACKOUT_E2E_BASE_URL / BASE_URL at it. Individual specs gate
// themselves on the env they need (BLACKOUT_E2E_BASE_URL, seed users,
// LS_COLISEUM_ROOM_ALIAS) and skip otherwise.
const baseURL =
    process.env.BLACKOUT_E2E_BASE_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:8080';

export default defineConfig({
    testDir: 'playwright/e2e',
    // navigation-audit and state-explosion have their own configs.
    testIgnore: [/navigation-audit/, /state-explosion/],
    outputDir: 'apps/blackout-client/playwright-report/launch-smoke-results',
    reporter: process.env.CI ? [['github'], ['list']] : [['list']],
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    use: {
        ...devices['Desktop Chrome'],
        baseURL,
        viewport: { width: 1280, height: 720 },
        trace: 'on-first-retry',
        video: 'retain-on-failure',
    },
});
