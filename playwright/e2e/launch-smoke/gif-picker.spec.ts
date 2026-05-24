import { expect, test, type Page } from '@playwright/test';

/**
 * Launch-smoke E2E for the Tenor GIF picker (LS-MEDIA-GIF-*).
 * See playwright/e2e/launch-smoke/messaging.spec.ts for harness conventions.
 *
 * Unlike the other launch-smoke specs, this one does NOT depend on a live
 * Tenor key on the homeserver — it intercepts the Blackout API's Tenor
 * proxy routes (`/v1/integrations/tenor/{featured,search,binary}`) with
 * `page.route`, so the picker grid + send path are exercised against fixed
 * fakes. It still requires a live Blackout stack to reach an authenticated
 * room composer (hence `requiresLiveStack`); it skips in local runs without
 * BLACKOUT_E2E_BASE_URL and runs in CI / against staging.
 */

const requiresLiveStack = test.extend({});

requiresLiveStack.beforeEach(async ({}, testInfo) => {
  if (!process.env.BLACKOUT_E2E_BASE_URL && !process.env.CI) {
    testInfo.skip(true, 'BLACKOUT_E2E_BASE_URL not set — skipping live-stack E2E.');
  }
});

const ROOM_NAME = process.env.LS_SMOKE_ROOM ?? 'smoke-launch';

// 1×1 transparent GIF, served by the mocked /binary proxy as the uploaded body.
const TINY_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login/i, { timeout: 20_000 });
}

async function openRoom(page: Page, roomName: string) {
  const roomLink = page.getByRole('link', { name: new RegExp(`#?${roomName}`, 'i') }).first();
  if (await roomLink.isVisible().catch(() => false)) {
    await roomLink.click();
  } else {
    await page.goto(`/#/room/%23${roomName}:${new URL(page.url()).host}`);
  }
}

/**
 * Intercept the three Tenor proxy endpoints with deterministic fakes:
 *   - /featured + /search → one picker item
 *   - /binary           → the tiny GIF bytes
 */
async function mockTenorProxy(page: Page) {
  const item = {
    id: 'tenor-e2e-1',
    description: 'an e2e cat gif',
    gif: { url: 'https://media.tenor.com/e2e/cat.gif', width: 2, height: 2, size: 64 },
    preview: { url: 'https://media.tenor.com/e2e/cat-tiny.gif', width: 1, height: 1 },
  };
  const listBody = JSON.stringify({ items: [item], next: null });

  await page.route('**/v1/integrations/tenor/featured**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: listBody }),
  );
  await page.route('**/v1/integrations/tenor/search**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: listBody }),
  );
  await page.route('**/v1/integrations/tenor/binary**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: Buffer.from(TINY_GIF_BASE64, 'base64'),
    }),
  );
  // The picker grid thumbnails point at media.tenor.com directly; stub them
  // so the test doesn't depend on outbound network or CSP.
  await page.route('https://media.tenor.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: Buffer.from(TINY_GIF_BASE64, 'base64'),
    }),
  );
}

requiresLiveStack('LS-MEDIA-GIF-01: search Tenor and send a GIF to the room', async ({ page }) => {
  await mockTenorProxy(page);
  await loginAs(
    page,
    process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
    process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
  );
  await openRoom(page, ROOM_NAME);

  // Open the GIF tab in the composer expression controls.
  await page.getByRole('button', { name: /insert gif/i }).first().click();

  // The Tenor panel renders its own search box.
  const search = page.getByRole('textbox', { name: /search gifs on tenor/i }).first();
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill('cats');

  // Pick the first result tile (labeled by its description).
  const tile = page.getByRole('button', { name: /an e2e cat gif/i }).first();
  await expect(tile).toBeVisible({ timeout: 10_000 });
  await tile.click();

  // The uploaded GIF should land in the timeline as an mxc-backed image.
  await expect(page.locator('img[src*="mxc:" i]').first()).toBeVisible({ timeout: 30_000 });
});

requiresLiveStack(
  'LS-MEDIA-GIF-02: picker falls back to packs when the proxy is disabled (503)',
  async ({ page }) => {
    // Simulate an operator without TENOR_API_KEY: every proxy call 503s.
    await page.route('**/v1/integrations/tenor/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'tenor_disabled', message: 'disabled' }),
      }),
    );
    await loginAs(
      page,
      process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
      process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
    );
    await openRoom(page, ROOM_NAME);

    await page.getByRole('button', { name: /insert gif/i }).first().click();

    // With Tenor disabled, the panel returns null and the existing
    // "No GIF Packs!" empty state (or user packs) is shown instead of the
    // Tenor search box.
    await expect(page.getByText(/no gif packs/i).first()).toBeVisible({ timeout: 10_000 });
  },
);
