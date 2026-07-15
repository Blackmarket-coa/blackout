import { expect, test, type Page } from '@playwright/test';

/**
 * Launch-smoke E2E coverage for the watch-party synchronized shared player.
 * Skipped without BLACKOUT_E2E_BASE_URL — see auth.spec.ts harness notes.
 *
 * What this proves end-to-end (two real browser contexts against a live
 * stack): the host's play/seek transport actions publish `co.bmc.watch_party`
 * state revisions over the homeserver, and a follower's <video> element
 * converges on the shared playhead through the reconciliation loop.
 *
 * Required env:
 *   LS_MEMBER_A_USERNAME / LS_MEMBER_A_PASSWORD — must hold power level >= 50
 *     in the target room (state-event writes are moderator-gated).
 *   LS_MEMBER_B_USERNAME / LS_MEMBER_B_PASSWORD — plain member (follower).
 *   LS_WATCH_PARTY_ROOM — defaults to LS_SMOKE_ROOM / 'smoke-launch'.
 *   LS_WATCH_PARTY_VIDEO_URL — https:// MP4 reachable from the browser under
 *     test; defaults to the public Big Buck Bunny sample.
 *
 * The room must have the live-interaction widget bundle enabled so the
 * watch-party right-panel surface mounts.
 */

const requiresLiveStack = test.extend({});

requiresLiveStack.beforeEach(async ({}, testInfo) => {
  if (!process.env.BLACKOUT_E2E_BASE_URL && !process.env.CI) {
    testInfo.skip(true, 'BLACKOUT_E2E_BASE_URL not set — skipping live-stack E2E.');
  }
});

const ROOM_NAME =
  process.env.LS_WATCH_PARTY_ROOM ?? process.env.LS_SMOKE_ROOM ?? 'smoke-launch';
const VIDEO_URL =
  process.env.LS_WATCH_PARTY_VIDEO_URL ??
  'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

const PLAYER = '[data-testid="watch-party-player"] video';

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

async function openWatchPartyPanel(page: Page) {
  // The shell exposes right-panel toggles by label/tooltip; try the common
  // aliases the ClientLayout renders for the watch_party widget panel.
  const candidates = [
    page.getByRole('button', { name: /watch party/i }).first(),
    page.getByTitle(/watch (videos|party)/i).first(),
    page.getByLabel(/watch party/i).first(),
  ];
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      return;
    }
  }
  throw new Error(
    'watch-party panel toggle not found — is the live-interaction bundle enabled for this room?',
  );
}

const videoState = (page: Page) =>
  page.evaluate((selector) => {
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    if (!video) return null;
    return { currentTime: video.currentTime, paused: video.paused };
  }, PLAYER);

requiresLiveStack(
  'watch party: follower playhead converges on host play and seek',
  async ({ browser }) => {
    requiresLiveStack.setTimeout(180_000);

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    try {
      const host = await contextA.newPage();
      const follower = await contextB.newPage();

      await loginAs(
        host,
        process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
        process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
      );
      await loginAs(
        follower,
        process.env.LS_MEMBER_B_USERNAME ?? 'smoke_member_b',
        process.env.LS_MEMBER_B_PASSWORD ?? 'change-me',
      );
      await openRoom(host, ROOM_NAME);
      await openRoom(follower, ROOM_NAME);

      // Host starts a shared-player party.
      await openWatchPartyPanel(host);
      await host.getByLabel('Video source URL').fill(VIDEO_URL);
      await host.getByLabel('Title (optional)').fill('E2E sync check');
      await host.getByRole('button', { name: 'Start watch party' }).click();
      await expect(host.locator(PLAYER)).toBeAttached({ timeout: 20_000 });

      // Follower sees the party arrive over room state.
      await openWatchPartyPanel(follower);
      await expect(follower.locator(PLAYER)).toBeAttached({ timeout: 30_000 });

      // Host plays. Driving the element directly exercises the same
      // play/seeked listeners the native controls do.
      await host.evaluate((selector) => {
        const video = document.querySelector(selector) as HTMLVideoElement;
        return video.play();
      }, PLAYER);

      // Autoplay policy can hold the follower until a gesture; the widget
      // surfaces a click-to-join overlay for exactly that case.
      const joinOverlay = follower.getByRole('button', { name: /join playback/i });
      if (await joinOverlay.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await joinOverlay.click();
      }

      await expect
        .poll(async () => (await videoState(follower))?.paused, {
          timeout: 30_000,
          message: 'follower should start playing after the host plays',
        })
        .toBe(false);

      // Host seeks deep into the file; the follower must hard-seek across
      // the drift threshold and land within a couple of seconds.
      await host.evaluate((selector) => {
        const video = document.querySelector(selector) as HTMLVideoElement;
        video.currentTime = 42;
      }, PLAYER);

      await expect
        .poll(async () => (await videoState(follower))?.currentTime ?? 0, {
          timeout: 30_000,
          message: 'follower playhead should converge on the host seek target',
        })
        .toBeGreaterThan(39);

      // And host pause propagates.
      await host.evaluate((selector) => {
        const video = document.querySelector(selector) as HTMLVideoElement;
        video.pause();
      }, PLAYER);

      await expect
        .poll(async () => (await videoState(follower))?.paused, {
          timeout: 30_000,
          message: 'follower should pause after the host pauses',
        })
        .toBe(true);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  },
);
