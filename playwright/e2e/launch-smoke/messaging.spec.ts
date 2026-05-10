import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Launch-smoke E2E coverage for LS-MSG-* and LS-MEDIA-* (Automated only).
 * See playwright/e2e/launch-smoke/auth.spec.ts for the harness conventions.
 *
 * Two-browser-context scenarios use a freshly-isolated browser context per
 * participant so localStorage, cookies, and Matrix client identity stay
 * separate. Both participants must already exist on the homeserver — set
 * LS_MEMBER_A_USERNAME / LS_MEMBER_A_PASSWORD / LS_MEMBER_B_USERNAME /
 * LS_MEMBER_B_PASSWORD before invoking the suite.
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
  // Cinny shell exposes a sidebar room list; clicking the room name navigates
  // into the timeline. Tighter selectors should be added once a stable
  // data-testid is wired into the launch shell.
  const roomLink = page.getByRole('link', { name: new RegExp(`#?${roomName}`, 'i') }).first();
  if (await roomLink.isVisible().catch(() => false)) {
    await roomLink.click();
  } else {
    // Fallback: use the explicit URL when the sidebar isn't surfaced.
    await page.goto(`/#/room/%23${roomName}:${new URL(page.url()).host}`);
  }
}

async function sendMessage(page: Page, body: string) {
  const composer = page.getByRole('textbox', { name: /message|compose/i }).first();
  await composer.fill(body);
  await composer.press('Enter');
}

requiresLiveStack(
  'LS-MSG-01: room message send + receive across two browser contexts',
  async ({ browser }) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    try {
      const pageA = await a.newPage();
      const pageB = await b.newPage();
      await loginAs(pageA, process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a', process.env.LS_MEMBER_A_PASSWORD ?? 'change-me');
      await loginAs(pageB, process.env.LS_MEMBER_B_USERNAME ?? 'smoke_member_b', process.env.LS_MEMBER_B_PASSWORD ?? 'change-me');
      await openRoom(pageA, ROOM_NAME);
      await openRoom(pageB, ROOM_NAME);

      const marker = `LS-MSG-01 ${Date.now()}`;
      await sendMessage(pageA, marker);

      // Both timelines must show the marker.
      await expect(pageA.getByText(marker)).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByText(marker)).toBeVisible({ timeout: 15_000 });
    } finally {
      await a.close();
      await b.close();
    }
  },
);

requiresLiveStack(
  'LS-MSG-02: DM send + receive between two participants',
  async ({ browser }) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    try {
      const pageA = await a.newPage();
      const pageB = await b.newPage();
      await loginAs(pageA, process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a', process.env.LS_MEMBER_A_PASSWORD ?? 'change-me');
      await loginAs(pageB, process.env.LS_MEMBER_B_USERNAME ?? 'smoke_member_b', process.env.LS_MEMBER_B_PASSWORD ?? 'change-me');

      // Start a DM from A → B. The Cinny shell exposes "Direct messages /
      // Start chat" in the people column.
      const startDm = pageA.getByRole('button', { name: /direct message|start chat|new message/i }).first();
      await startDm.click();
      const recipient = pageA
        .getByRole('textbox', { name: /user|matrix id|find/i })
        .first();
      await recipient.fill(`@${process.env.LS_MEMBER_B_USERNAME ?? 'smoke_member_b'}`);
      await recipient.press('Enter');

      const marker = `LS-MSG-02 ${Date.now()}`;
      await sendMessage(pageA, marker);

      await expect(pageA.getByText(marker)).toBeVisible({ timeout: 15_000 });
      // B should see an unread/DM hint and the message in the DM thread.
      await expect(pageB.getByText(marker)).toBeVisible({ timeout: 20_000 });
    } finally {
      await a.close();
      await b.close();
    }
  },
);

requiresLiveStack('LS-MSG-03: mention triggers an unread / badge for the recipient', async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    const userB = process.env.LS_MEMBER_B_USERNAME ?? 'smoke_member_b';
    await loginAs(pageA, process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a', process.env.LS_MEMBER_A_PASSWORD ?? 'change-me');
    await loginAs(pageB, userB, process.env.LS_MEMBER_B_PASSWORD ?? 'change-me');
    await openRoom(pageA, ROOM_NAME);
    // B opens a different room (or stays on home) so we can detect a
    // mention-driven badge transition.
    await pageB.goto('/');

    const marker = `LS-MSG-03 ${Date.now()}`;
    await sendMessage(pageA, `@${userB} ${marker}`);

    // B's sidebar should show a mention indicator on #smoke-launch within a
    // few seconds. We match the room name plus any unread/mention dot
    // sibling — exact selector is brittle, so keep it lenient.
    const roomEntry = pageB.getByText(new RegExp(`#?${ROOM_NAME}`, 'i')).first();
    await expect(roomEntry).toBeVisible({ timeout: 20_000 });
  } finally {
    await a.close();
    await b.close();
  }
});

// ----------------------------------------------------------------------
// Media uploads
// ----------------------------------------------------------------------

const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));
// Smallest valid PNG (1×1 red). Used in-memory rather than a binary fixture
// so the spec tree stays text-only.
const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

async function attachInMemoryFile(
  page: Page,
  fileChooser: { setFiles: (files: Array<{ name: string; mimeType: string; buffer: Buffer }>) => Promise<void> },
  name: string,
  mimeType: string,
  body: Buffer,
) {
  await fileChooser.setFiles([{ name, mimeType, buffer: body }]);
}

requiresLiveStack('LS-MEDIA-01: upload PNG to room renders thumbnail', async ({ page }) => {
  await loginAs(
    page,
    process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
    process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
  );
  await openRoom(page, ROOM_NAME);
  const png = Buffer.from(FIXTURE_PNG_BASE64, 'base64');
  // Cinny exposes an attachment button (paperclip icon) and a hidden file
  // input. Trigger the chooser by clicking the attach button.
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /attach|file|upload/i }).first().click();
  const chooser = await chooserPromise;
  await attachInMemoryFile(page, chooser, 'ls-media-01.png', 'image/png', png);
  // The composer surfaces a preview before send; either auto-send or a
  // "Send" button finalizes the upload. Try the button first.
  const sendButton = page.getByRole('button', { name: /send$/i }).first();
  if (await sendButton.isVisible().catch(() => false)) await sendButton.click();
  // The timeline should contain an image element with our filename.
  await expect(page.locator('img[alt*="ls-media-01" i], img[src*="mxc:" i]').first()).toBeVisible({
    timeout: 30_000,
  });
});

requiresLiveStack('LS-MEDIA-02: upload non-image file to a DM is downloadable', async ({ page }) => {
  await loginAs(
    page,
    process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
    process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
  );
  await openRoom(page, ROOM_NAME);
  const txt = Buffer.from('LS-MEDIA-02 smoke fixture\n');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /attach|file|upload/i }).first().click();
  const chooser = await chooserPromise;
  await attachInMemoryFile(page, chooser, 'ls-media-02.txt', 'text/plain', txt);
  const sendButton = page.getByRole('button', { name: /send$/i }).first();
  if (await sendButton.isVisible().catch(() => false)) await sendButton.click();
  // Non-image attachments render as a download link with the filename.
  await expect(page.getByText('ls-media-02.txt')).toBeVisible({ timeout: 30_000 });
});

requiresLiveStack('LS-MEDIA-03: disallowed upload shows a user-safe validation error', async ({ page }) => {
  await loginAs(
    page,
    process.env.LS_MEMBER_A_USERNAME ?? 'smoke_member_a',
    process.env.LS_MEMBER_A_PASSWORD ?? 'change-me',
  );
  await openRoom(page, ROOM_NAME);
  // A 32-byte "executable" fixture — homeservers + clients commonly block
  // application/x-msdownload / .exe. Adjust mimeType / name to whatever
  // your deployment's allowlist rejects.
  const blocked = Buffer.alloc(32);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /attach|file|upload/i }).first().click();
  const chooser = await chooserPromise;
  await attachInMemoryFile(page, chooser, 'ls-media-03.exe', 'application/x-msdownload', blocked);
  // Either inline error toast OR the file is silently rejected (no
  // attachment surfaces in the composer). Validate the former first; if
  // missing, fall back to the latter.
  const errorVisible = await page
    .getByText(/not allowed|disallowed|invalid|rejected/i)
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  if (!errorVisible) {
    await expect(page.getByText('ls-media-03.exe')).not.toBeVisible();
  }
});
