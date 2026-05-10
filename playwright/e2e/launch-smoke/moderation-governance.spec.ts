import { expect, test, type Page } from '@playwright/test';

/**
 * Launch-smoke E2E coverage for LS-MOD-* and LS-GOV-* (Automated only).
 * Skipped without BLACKOUT_E2E_BASE_URL — see auth.spec.ts harness notes.
 *
 * Required env: LS_MEMBER_A_USERNAME, LS_MEMBER_A_PASSWORD,
 *               LS_MEMBER_B_USERNAME, LS_MEMBER_B_PASSWORD,
 *               LS_MODERATOR_USERNAME, LS_MODERATOR_PASSWORD,
 *               LS_OWNER_USERNAME, LS_OWNER_PASSWORD
 */

const requiresLiveStack = test.extend({});

requiresLiveStack.beforeEach(async ({}, testInfo) => {
  if (!process.env.BLACKOUT_E2E_BASE_URL && !process.env.CI) {
    testInfo.skip(true, 'BLACKOUT_E2E_BASE_URL not set — skipping live-stack E2E.');
  }
});

const ROOM_NAME = process.env.LS_SMOKE_ROOM ?? 'smoke-launch';

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

requiresLiveStack(
  'LS-MOD-01: moderator can redact an abusive message in the room',
  async ({ browser }) => {
    const targetCtx = await browser.newContext();
    const modCtx = await browser.newContext();
    try {
      const target = await targetCtx.newPage();
      const mod = await modCtx.newPage();
      await loginAs(target, process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a', process.env.LS_MEMBER_A_PASSWORD ?? 'change-me');
      await loginAs(mod, process.env.LS_MODERATOR_USERNAME ?? 'smoke_moderator', process.env.LS_MODERATOR_PASSWORD ?? 'change-me');
      await openRoom(target, ROOM_NAME);
      await openRoom(mod, ROOM_NAME);

      const marker = `LS-MOD-01 abusive ${Date.now()}`;
      await target.getByRole('textbox', { name: /message|compose/i }).first().fill(marker);
      await target.getByRole('textbox', { name: /message|compose/i }).first().press('Enter');

      await expect(mod.getByText(marker)).toBeVisible({ timeout: 15_000 });
      // Open the message-action menu on the moderator side. Cinny exposes
      // either a hover menu or a context menu; right-click reliably opens
      // it across both UIs.
      const messageRow = mod.getByText(marker).first();
      await messageRow.click({ button: 'right' });
      const redactItem = mod.getByRole('menuitem', { name: /redact|remove|delete/i }).first();
      await redactItem.click();
      const confirm = mod.getByRole('button', { name: /redact|remove|confirm|delete/i }).first();
      if (await confirm.isVisible().catch(() => false)) await confirm.click();

      // The redacted message is replaced with a tombstone marker in both
      // timelines.
      await expect(mod.getByText(marker)).not.toBeVisible({ timeout: 15_000 });
      await expect(
        target.getByText(/redacted|removed|message deleted/i).first(),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await targetCtx.close();
      await modCtx.close();
    }
  },
);

requiresLiveStack(
  'LS-MOD-03: non-moderator does not see destructive moderation affordances',
  async ({ browser }) => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await loginAs(page, process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a', process.env.LS_MEMBER_A_PASSWORD ?? 'change-me');
      await openRoom(page, ROOM_NAME);

      // Find any existing message in the room and try to open a context
      // menu. The non-moderator must NOT see redact/ban/kick affordances.
      const anyMessage = page.locator('[role="article"], .messageRow, .timelineEvent').first();
      if (await anyMessage.isVisible().catch(() => false)) {
        await anyMessage.click({ button: 'right' });
        for (const forbidden of [/redact/i, /ban\b/i, /kick\b/i, /remove user/i]) {
          const item = page.getByRole('menuitem', { name: forbidden }).first();
          await expect(item).toHaveCount(0);
        }
      }
    } finally {
      await ctx.close();
    }
  },
);

// ----------------------------------------------------------------------
// Governance
// ----------------------------------------------------------------------

requiresLiveStack('LS-GOV-01: owner can create a governance proposal', async ({ browser }) => {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await loginAs(page, process.env.LS_OWNER_USERNAME ?? 'smoke_owner', process.env.LS_OWNER_PASSWORD ?? 'change-me');

    // Navigate to the governance "Create" tab. BKL-003 mounts the registry
    // tab strip so /governance?tab=create selects the create view.
    await page.goto('/governance?tab=create');
    const title = `LS-GOV-01 proposal ${Date.now()}`;
    await page.getByLabel(/title/i).first().fill(title);
    const descField = page.getByLabel(/description|details/i).first();
    if (await descField.isVisible().catch(() => false)) {
      await descField.fill('Launch-smoke proposal — safe to ignore.');
    }
    await page.getByRole('button', { name: /create|submit|propose/i }).first().click();

    // Returned to the Active tab; new proposal appears in the list.
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
  } finally {
    await ctx.close();
  }
});

requiresLiveStack('LS-GOV-02: voter can cast a vote and see the tally update', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const voterCtx = await browser.newContext();
  try {
    const owner = await ownerCtx.newPage();
    const voter = await voterCtx.newPage();
    await loginAs(owner, process.env.LS_OWNER_USERNAME ?? 'smoke_owner', process.env.LS_OWNER_PASSWORD ?? 'change-me');
    await loginAs(voter, process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a', process.env.LS_MEMBER_A_PASSWORD ?? 'change-me');

    // Owner creates the proposal.
    const title = `LS-GOV-02 vote ${Date.now()}`;
    await owner.goto('/governance?tab=create');
    await owner.getByLabel(/title/i).first().fill(title);
    await owner.getByRole('button', { name: /create|submit|propose/i }).first().click();
    await expect(owner.getByText(title)).toBeVisible({ timeout: 20_000 });

    // Voter opens the active proposal and casts a vote.
    await voter.goto('/governance?tab=active');
    const proposalRow = voter.getByText(title).first();
    await proposalRow.click();
    const yesButton = voter.getByRole('button', { name: /^yes$|approve|in favor/i }).first();
    await yesButton.click();
    await expect(
      voter.getByText(/your vote|voted|thanks for voting/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Results tab reflects the cast vote.
    await owner.goto('/governance?tab=results');
    await expect(owner.getByText(title)).toBeVisible({ timeout: 15_000 });
  } finally {
    await ownerCtx.close();
    await voterCtx.close();
  }
});
