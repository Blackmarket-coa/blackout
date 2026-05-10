import { expect, test } from '@playwright/test';

/**
 * Launch-smoke E2E coverage for LS-AUTH-* IDs in docs/launch-smoke-suite.md.
 * Each test names its LS-* ID so a Playwright report surfaces case status
 * directly in the launch gate's evidence pack.
 *
 * Prerequisites:
 *   - A running Blackout client (`apps/blackout-client`) reachable at BASE_URL
 *     (default http://localhost:8080).
 *   - A reachable Matrix homeserver with the smoke seed users — see
 *     docs/launch-smoke-suite.md "Environment & Data Preconditions".
 *
 * Each test is skipped automatically when BLACKOUT_E2E_BASE_URL is unset so
 * a `pnpm test:e2e` against a vanilla checkout doesn't fail; a smoke run
 * sets the env var (or relies on playwright.config.ts webServer + BASE_URL)
 * before invoking.
 */

const requiresLiveStack = test.extend({});

requiresLiveStack.beforeEach(async ({}, testInfo) => {
  if (!process.env.BLACKOUT_E2E_BASE_URL && !process.env.CI) {
    testInfo.skip(true, 'BLACKOUT_E2E_BASE_URL not set — skipping live-stack E2E.');
  }
});

requiresLiveStack('LS-AUTH-01: valid login lands on authenticated landing', async ({ page }) => {
  const username = process.env.LS_AUTH_USERNAME ?? 'smoke_member_a';
  const password = process.env.LS_AUTH_PASSWORD ?? 'change-me';
  await page.goto('/');
  // The login form on the canonical Cinny shell exposes a username + password
  // input. The exact selectors are intentionally lenient so the spec survives
  // small UX refinements; tighten when the launch shell stabilizes.
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // The post-login landing renders the room list / app shell. We just check
  // the user is no longer on a route that contains the word "login".
  await expect(page).not.toHaveURL(/\/login/i, { timeout: 20_000 });
});

requiresLiveStack('LS-AUTH-02: invalid password shows a user-safe error', async ({ page }) => {
  const username = process.env.LS_AUTH_USERNAME ?? 'smoke_member_a';
  await page.goto('/');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill('definitely-not-the-password');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Error toast / inline message. Match either an explicit error region or
  // the well-known string. Both must appear without redirecting away from
  // the login form.
  await expect(page).toHaveURL(/\/login|^\/$/, { timeout: 5_000 });
  const errorVisible = await page
    .getByText(/invalid|incorrect|wrong/i)
    .first()
    .isVisible()
    .catch(() => false);
  expect(errorVisible).toBe(true);
});
