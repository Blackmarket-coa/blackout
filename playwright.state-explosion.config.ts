import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated Playwright config for the state-explosion suite. Kept separate
 * from the root smoke config (which gates on zero console errors and
 * rejects routes the unauthenticated bootstrap can't reach) and from the
 * navigation-audit config (which runs route-level invariants) so the
 * stress scenarios — popup × mobile keyboard, reconnect × modal, voice
 * chat × overlays, plugin × navigation, mid-transition resize, rapid
 * clicks, and injected latency — can opt out of the strict gating while
 * still riding the same `vite preview` web server.
 */
const PORT = Number.parseInt(process.env.E2E_PORT ?? '4173', 10);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: 'playwright/e2e/state-explosion',
    outputDir: 'audit/state-explosion/playwright-results',
    reporter: process.env.CI
        ? [['github'], ['list']]
        : [
              ['list'],
              [
                  'html',
                  { outputFolder: 'audit/state-explosion/playwright-html', open: 'never' },
              ],
          ],
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 1 : 2,
    use: {
        baseURL,
        viewport: { width: 1280, height: 800 },
        trace: 'on-first-retry',
        video: 'retain-on-failure',
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
