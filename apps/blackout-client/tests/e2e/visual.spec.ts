import { snapVisual, visualTest as test } from './helpers/visual';

// Anonymous-shell visual regression. Runs against the Vite preview server
// spun up by playwright.config.ts — no live homeserver required, so this
// suite is the default gate in the visual-regression CI job. Authenticated
// surfaces live in playwright/e2e/launch-smoke/visual.spec.ts behind the
// BLACKOUT_E2E_BASE_URL opt-in.

test.describe('Blackout client visual shell', () => {
  test('landing / boot screen', async ({ page, visualMeta }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await snapVisual(page, `landing-${visualMeta.viewport}-${visualMeta.theme}`);
  });

  test('unknown route renders the 404 surface', async ({ page, visualMeta }) => {
    await page.goto('/__visual_regression_404__', { waitUntil: 'domcontentloaded' });
    await snapVisual(page, `not-found-${visualMeta.viewport}-${visualMeta.theme}`);
  });
});
