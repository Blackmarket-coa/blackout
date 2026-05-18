import type { Page } from '@playwright/test';
import {
  snapVisual,
  visualTest as test,
} from '../../../apps/blackout-client/tests/e2e/helpers/visual';

/**
 * Authenticated visual regression coverage for the launch-smoke shell.
 *
 * Same gating as the rest of playwright/e2e/launch-smoke/* — needs a live
 * homeserver and seed users. Skipped whenever BLACKOUT_E2E_BASE_URL is
 * unset (CI included) because the vite preview spun up by
 * playwright.config.ts only serves the static client bundle — there is no
 * homeserver to authenticate against, so the signIn flow would always
 * fail. A dedicated authed workflow can opt-in by exporting
 * BLACKOUT_E2E_BASE_URL pointing at a live stack.
 *
 * Selectors are deliberately lenient and mirror messaging.spec.ts /
 * auth.spec.ts so we don't drift apart from the existing launch-smoke
 * harness.
 */

const LS_MEMBER_A_USERNAME =
  process.env.LS_MEMBER_A_USERNAME ?? process.env.LS_AUTH_USERNAME ?? 'smoke_member_a';
const LS_MEMBER_A_PASSWORD =
  process.env.LS_MEMBER_A_PASSWORD ?? process.env.LS_AUTH_PASSWORD ?? 'change-me';

test.beforeEach(async ({}, testInfo) => {
  if (!process.env.BLACKOUT_E2E_BASE_URL) {
    testInfo.skip(true, 'BLACKOUT_E2E_BASE_URL not set — skipping live-stack visual run.');
  }
});

const signIn = async (page: Page): Promise<void> => {
  await page.goto('/');
  if (!/\/login/i.test(page.url())) return;
  await page.getByLabel(/username/i).fill(LS_MEMBER_A_USERNAME);
  await page.getByLabel(/password/i).fill(LS_MEMBER_A_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !/\/login/i.test(url.pathname), { timeout: 20_000 });
};

test.describe('Blackout authed visual surfaces', () => {
  test('home after login', async ({ page, visualMeta }) => {
    await signIn(page);
    await snapVisual(page, `home-${visualMeta.viewport}-${visualMeta.theme}`, {
      mask: [
        page.locator('[data-testid$="-timestamp"]'),
        page.locator('[data-testid$="-last-seen"]'),
      ],
    });
  });

  test('settings shell', async ({ page, visualMeta }) => {
    await signIn(page);
    await page.goto('/settings');
    await snapVisual(page, `settings-${visualMeta.viewport}-${visualMeta.theme}`);
  });
});
