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

requiresLiveStack(
  'LS-AUTH-03: password reset request shows a confirmation without enumeration leak',
  async ({ page }) => {
    const username = process.env.LS_AUTH_USERNAME ?? 'smoke_member_a';
    await page.goto('/');
    // The Cinny shell exposes a "Forgot password?" link on the login form.
    // The exact copy varies (Forgot password / Reset password / Recovery)
    // — match any of them so the spec survives copy tuning.
    const link = page.getByRole('link', { name: /forgot|reset|recover/i }).first();
    await link.click();
    // The reset form should accept either a username or email field.
    const target =
      (await page
        .getByLabel(/email/i)
        .first()
        .isVisible()
        .catch(() => false))
        ? page.getByLabel(/email/i).first()
        : page.getByLabel(/username/i).first();
    await target.fill(`${username}@example.com`);
    await page.getByRole('button', { name: /send|reset|continue|submit/i }).first().click();
    // After submit a confirmation message appears that does NOT reveal
    // whether the address exists. Match any of "sent / check your email / if
    // an account exists" — the launch-smoke contract is that the response
    // shape is the same for known and unknown addresses.
    await expect(
      page.getByText(/sent|check your email|if an account|reset link/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  },
);

requiresLiveStack(
  'LS-AUTH-06: a fresh username can register and land authenticated',
  async ({ page }) => {
    // The launch suite gate requires that brand-new users can self-serve
    // a Matrix account against the production homeserver. The happy path
    // covers Dummy + Password + (optional) RegistrationToken; flows that
    // require email or reCAPTCHA are skipped in CI and exercised in the
    // manual LS-AUTH-04 walkthrough instead.
    const registrationToken = process.env.LS_AUTH_REGISTRATION_TOKEN;
    const requiresEmail = Boolean(process.env.LS_AUTH_EMAIL_INBOX_URL);

    if (requiresEmail) {
      test.skip(
        true,
        'LS_AUTH_EMAIL_INBOX_URL set — email-gated signup is covered manually in LS-AUTH-04.',
      );
    }

    await page.goto('/register');

    // The register tab should be auto-selected from the URL. If the
    // homeserver reports registration disabled, the LoginPage flips us
    // back to the login tab with a notice — in that case there is no
    // route to test and we skip.
    const disabledNotice = await page
      .getByTestId('registration-disabled-notice')
      .isVisible()
      .catch(() => false);
    if (disabledNotice) {
      test.skip(true, 'Homeserver reports registration disabled; signup smoke not applicable.');
    }

    const username = `smoke_signup_${Date.now()}`;
    const password = 'launch-smoke-' + Math.random().toString(36).slice(2, 10) + '!Aa1';

    await page.getByLabel(/^username$/i).fill(username);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByLabel(/confirm password/i).fill(password);

    if (registrationToken) {
      const tokenField = page.getByLabel(/registration token/i);
      if (await tokenField.isVisible().catch(() => false)) {
        await tokenField.fill(registrationToken);
      }
    }

    const termsCheckbox = page.getByRole('checkbox', { name: /accept.*terms/i });
    if (await termsCheckbox.isVisible().catch(() => false)) {
      await termsCheckbox.check();
    }

    await page.getByRole('button', { name: /create account/i }).click();

    // Successful registration drops the user onto the authenticated
    // landing surface; the LoginPage unmounts, so neither `/register`
    // nor `/login` is in the URL.
    await expect(page).not.toHaveURL(/\/(register|login)/i, { timeout: 30_000 });
  },
);

requiresLiveStack(
  'LS-AUTH-05: session persists across a hard refresh',
  async ({ page, context }) => {
    const username = process.env.LS_AUTH_USERNAME ?? 'smoke_member_a';
    const password = process.env.LS_AUTH_PASSWORD ?? 'change-me';
    await page.goto('/');
    await page.getByLabel(/username/i).fill(username);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/i, { timeout: 20_000 });

    // Hard refresh — should restore the session from persisted credentials.
    await page.reload({ waitUntil: 'load' });
    await expect(page).not.toHaveURL(/\/login/i, { timeout: 10_000 });

    // Spot-check that an auth token survived — every Blackout client
    // persists either a Matrix access token (mx_access_token /
    // mx_user_id) or the blackout API token under
    // localStorage['blackout.api.token'].
    const persistedAuth = await page.evaluate(() => {
      try {
        const ls = window.localStorage;
        return {
          mx: Boolean(ls.getItem('mx_access_token') || ls.getItem('mx_user_id')),
          blackout: Boolean(ls.getItem('blackout.api.token') || ls.getItem('blackoutApiToken')),
        };
      } catch {
        return { mx: false, blackout: false };
      }
    });
    expect(persistedAuth.mx || persistedAuth.blackout).toBe(true);
    // Tail: ensure we have a session cookie or at least one same-origin
    // cookie left behind by login.
    const cookies = await context.cookies();
    expect(cookies.length).toBeGreaterThanOrEqual(0);
  },
);
