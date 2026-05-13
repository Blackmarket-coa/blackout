import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke layer for the Blackout web client. Keeps a small surface
// area on purpose — the unit / integration suites live under
// apps/blackout-client/tests/{unit,smoke}; this layer is the canary that
// proves a built bundle still boots in a real browser.

const PORT = Number.parseInt(process.env.E2E_PORT ?? '4173', 10);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'apps/blackout-client/tests/e2e',
  outputDir: 'apps/blackout-client/playwright-report/test-results',
  reporter: process.env.CI
    ? [['github'], ['list']]
    : [['html', { outputFolder: 'apps/blackout-client/playwright-report/html', open: 'never' }]],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm --filter @blackout/client exec vite preview --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
