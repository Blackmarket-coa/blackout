import { expect, test, type Page } from '@playwright/test';

/**
 * Launch-smoke E2E coverage for LS-CALL-* (Automated only).
 * Skipped without BLACKOUT_E2E_BASE_URL — see auth.spec.ts harness notes.
 *
 * Full TURN-relay validation lives in the manual tier (LS-CALL-02 /
 * LS-CALL-04 in docs/launch-smoke-suite.md) — those require a restricted
 * network profile and human-confirmed audio quality, neither of which is
 * cleanly automatable here. What this suite covers is:
 *
 *   LS-CALL-01: a participant can join a voice room and the SDK reports
 *               a connected state (proves SFU + LiveKit token + signaling).
 *   LS-CALL-03: mute toggling updates the local UI state.
 *
 * Required env: LS_MEMBER_A_USERNAME / LS_MEMBER_A_PASSWORD plus a voice
 * channel reachable from the homeserver. LS_CALL_ROOM defaults to the
 * smoke-launch room. The Playwright Chrome project already passes
 * --use-fake-ui-for-media-stream + --use-fake-device-for-media-stream
 * (see playwright.config.ts) so getUserMedia resolves without a host
 * device.
 */

const requiresLiveStack = test.extend({});

requiresLiveStack.beforeEach(async ({}, testInfo) => {
  if (!process.env.BLACKOUT_E2E_BASE_URL && !process.env.CI) {
    testInfo.skip(true, 'BLACKOUT_E2E_BASE_URL not set — skipping live-stack E2E.');
  }
});

const ROOM_NAME = process.env.LS_CALL_ROOM ?? process.env.LS_SMOKE_ROOM ?? 'smoke-launch';

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

requiresLiveStack('LS-CALL-01: voice room join reaches a connected state', async ({ page }) => {
  await loginAs(
    page,
    process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
    process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
  );
  await openRoom(page, ROOM_NAME);

  // The Cinny shell exposes a voice-channel join control inside the room
  // header or right-panel. Try a few aliases.
  const joinButton = page
    .getByRole('button', { name: /join voice|start call|join call|join voice channel/i })
    .first();
  await joinButton.click();

  // Either:
  //   - The call widget surfaces a "Connected" / "Joined" label, or
  //   - The participant list contains our identity, or
  //   - The CallProvider exposes a data-testid we can probe.
  const connected = await Promise.race([
    page
      .getByText(/connected|joined|in call/i)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false),
    page
      .locator('[data-testid="call-participant-self"], [data-testid="call-widget-connected"]')
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false),
  ]);
  expect(connected).toBe(true);
});

requiresLiveStack('LS-CALL-03: mute toggle updates local UI state', async ({ page }) => {
  await loginAs(
    page,
    process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
    process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
  );
  await openRoom(page, ROOM_NAME);
  await page
    .getByRole('button', { name: /join voice|start call|join call|join voice channel/i })
    .first()
    .click();

  const mute = page.getByRole('button', { name: /^mute$|microphone/i }).first();
  await mute.waitFor({ state: 'visible', timeout: 20_000 });

  // Toggle: pressed-state should flip between aria-pressed true/false (or
  // between "Mute" and "Unmute" labels). Capture the pre-state, click,
  // assert it flipped.
  const before = (await mute.getAttribute('aria-pressed')) ?? (await mute.textContent());
  await mute.click();
  const after = (await mute.getAttribute('aria-pressed')) ?? (await mute.textContent());
  expect(after).not.toEqual(before);
});
