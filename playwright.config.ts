import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke layer for the Blackout web client. Keeps a small surface
// area on purpose — the unit / integration suites live under
// apps/blackout-client/tests/{unit,smoke}; this layer is the canary that
// proves a built bundle still boots in a real browser.
//
// The `visual-*` projects layer pixel-diff regression coverage on top of the
// same web server, fanned out across mobile/tablet/desktop × light/dark. See
// apps/blackout-client/tests/e2e/helpers/visual.ts for the per-project theme
// fixture.

const PORT = Number.parseInt(process.env.E2E_PORT ?? '4173', 10);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

const VISUAL_VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;

type VisualViewport = keyof typeof VISUAL_VIEWPORTS;
type VisualTheme = 'light' | 'dark';

const visualProjects = (
  Object.keys(VISUAL_VIEWPORTS) as VisualViewport[]
).flatMap((viewport) =>
  (['light', 'dark'] as VisualTheme[]).map((theme) => ({
    name: `visual-${viewport}-${theme}`,
    testMatch: /visual\.spec\.ts$/,
    use: {
      ...devices['Desktop Chrome'],
      viewport: VISUAL_VIEWPORTS[viewport],
      colorScheme: theme,
    },
  })),
);

export default defineConfig({
  testDir: '.',
  outputDir: 'apps/blackout-client/playwright-report/test-results',
  reporter: process.env.CI
    ? [['github'], ['list']]
    : [['html', { outputFolder: 'apps/blackout-client/playwright-report/html', open: 'never' }]],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.01,
      stylePath: 'apps/blackout-client/tests/e2e/helpers/visual.css',
    },
  },
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testDir: 'apps/blackout-client/tests/e2e',
      testIgnore: /visual\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    ...visualProjects,
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
