import { expect, test, type Page } from '@playwright/test';

/**
 * Coliseum Coalition smoke (SEEDED_ISSUES #8).
 *
 * Verifies the launch-day Coliseum Coalition renders end-to-end once it
 * has been seeded on the target homeserver (launch prep B6):
 *
 *   1. Signs in as the standard smoke member.
 *   2. Opens the Coalition surface for the Coliseum room.
 *   3. Confirms every enabled tab (per `co.bmc.coalition` `enabledTabs`,
 *      `packages/core/src/coalition/events.ts`) renders when activated.
 *   4. Confirms at least one seeded mutual-aid post is visible.
 *   5. Confirms the seeded governance proposal is visible.
 *
 * Env inputs (see launch-smoke conventions in
 * playwright/e2e/launch-smoke/auth.spec.ts):
 *   - BLACKOUT_E2E_BASE_URL          — live-stack gate (skips otherwise)
 *   - LS_COLISEUM_ROOM_ALIAS         — the Coliseum room alias, e.g.
 *                                      "#coliseum:matrix.theblackout.app".
 *                                      The spec skips until this is set,
 *                                      i.e. until the Coalition is seeded.
 *   - LS_COLISEUM_MUTUAL_AID_TEXT    — optional: exact seeded mutual-aid
 *                                      post text to assert (falls back to
 *                                      "any need card renders").
 *   - LS_COLISEUM_PROPOSAL_TEXT      — optional: exact seeded proposal
 *                                      title to assert (falls back to
 *                                      "any proposal renders").
 */

const requiresSeededColiseum = test.extend({});

requiresSeededColiseum.beforeEach(async ({}, testInfo) => {
  if (!process.env.BLACKOUT_E2E_BASE_URL && !process.env.CI) {
    testInfo.skip(true, 'BLACKOUT_E2E_BASE_URL not set — skipping live-stack E2E.');
  }
  if (!process.env.LS_COLISEUM_ROOM_ALIAS) {
    testInfo.skip(
      true,
      'LS_COLISEUM_ROOM_ALIAS not set — Coliseum Coalition not seeded yet (launch prep B6).',
    );
  }
});

async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login/i, { timeout: 20_000 });
}

async function openColiseumCoalition(page: Page) {
  const alias = process.env.LS_COLISEUM_ROOM_ALIAS ?? '';
  // Join/open the Coliseum room by alias, then move to the Coalition surface.
  await page.goto(`/#/room/${encodeURIComponent(alias)}`);
  const joinButton = page.getByRole('button', { name: /^join/i }).first();
  if (await joinButton.isVisible().catch(() => false)) {
    await joinButton.click();
  }
  await page.goto('/#/coalition');
  await expect(page.getByTestId('coalition-view')).toBeVisible({ timeout: 20_000 });
}

requiresSeededColiseum(
  'coliseum coalition: every enabled tab renders',
  async ({ page }) => {
    await loginAs(
      page,
      process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
      process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
    );
    await openColiseumCoalition(page);

    // The strip renders exactly the enabled tabs (falls back to the full
    // canonical set when the state event enables none), so walking the
    // rendered [data-coalition-tab] buttons IS the enabledTabs check.
    const tabs = page.locator('[data-coalition-tab]');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const tab = tabs.nth(i);
      const id = await tab.getAttribute('data-coalition-tab');
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      // The surface must stay mounted after every activation — a tab that
      // crashes its panel unmounts the whole view.
      await expect(
        page.getByTestId('coalition-view'),
        `coalition view survived activating tab "${id}"`,
      ).toBeVisible();
    }
  },
);

requiresSeededColiseum(
  'coliseum coalition: seeded mutual-aid post is visible',
  async ({ page }) => {
    await loginAs(
      page,
      process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
      process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
    );
    await openColiseumCoalition(page);

    await page.locator('[data-coalition-tab="needs"]').click();
    const cards = page.getByTestId('coalition-need-card');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });

    const seededText = process.env.LS_COLISEUM_MUTUAL_AID_TEXT;
    if (seededText) {
      await expect(page.getByText(seededText).first()).toBeVisible();
    }
  },
);

requiresSeededColiseum(
  'coliseum coalition: seeded governance proposal is visible',
  async ({ page }) => {
    await loginAs(
      page,
      process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
      process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
    );
    await openColiseumCoalition(page);

    // Governance lives on its own surface; the seeded proposal must show
    // up in the proposals list.
    await page.goto('/#/governance');
    const seededText = process.env.LS_COLISEUM_PROPOSAL_TEXT;
    if (seededText) {
      await expect(page.getByText(seededText).first()).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(
        page.getByText(/proposal/i).first(),
        'governance surface renders at least one proposal reference',
      ).toBeVisible({ timeout: 15_000 });
    }
  },
);
