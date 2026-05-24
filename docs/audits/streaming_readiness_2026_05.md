# Streaming services & platform connections — readiness audit (2026-05)

Scope: every "streaming service / feature" in the app — the livestream
viewer/directory, broadcast tooling (RTMP simulcast, OBS-WebSocket, Twitch IRC
bot tokens, widget-alert overlays), platform connections (linked accounts + chat
bridges + webhooks), voice/video calls, and the supporting server integrations.

## Summary

The streaming **backend and most client components are production-ready and
well-tested**. The decisive gap was **reachability**, not implementation:

1. **Platform-connection UIs were built but orphaned.** Linked accounts
   (Twitch/YouTube/Discord/Patreon/Streamlabs), the Twitch/YouTube/Kick chat
   bridges, simulcast destinations, OBS-WS passwords, Twitch IRC bot tokens,
   widget-alert tokens, Discord-compat + outbound webhooks, and the
   integrations-health dashboard all live in `features/settings/account/Account.tsx`,
   reachable only through the old `features/settings/Settings.tsx` shell — which
   nothing mounts. The app mounts `features/settings/SettingsPage.tsx`
   (`ClientLayout.tsx:1623`), and that page has **no** integrations section. Users
   had no way to reach any of it.
2. **Voice/video call controls were decorative.** Mute / camera / screen-share
   buttons flipped React state but never touched the media tracks
   (`features/call/CallProvider.tsx`); there was no `getDisplayMedia` anywhere in
   the client.

Both are addressed in this change.

## Readiness matrix

| Area | Backend | Client | Reachable before | Status |
| --- | --- | --- | --- | --- |
| Livestream viewer/directory (`/live`) | ✅ | ✅ | ✅ (flag `streamsViewer`) | Ready |
| RTMP simulcast destinations + fan-out | ✅ tested | ✅ | ❌ orphaned | Now reachable via `/streaming` |
| OBS-WebSocket passwords | ✅ tested | ✅ | ❌ orphaned | Now reachable |
| Twitch IRC bot tokens / widget-alert overlays | ✅ tested | ✅ | ❌ orphaned | Now reachable |
| Linked accounts (Twitch/YouTube/Discord/Patreon/Streamlabs) | ✅ tested | ✅ | ❌ orphaned | Now reachable |
| Chat bridges (Twitch/YouTube/Kick) | ✅ tested | ✅ | ❌ orphaned | Now reachable |
| Discord-compat + outbound webhooks | ✅ tested | ✅ | ❌ orphaned | Now reachable |
| Integrations health dashboard | ✅ tested | ✅ | ❌ orphaned | Now reachable |
| Voice/video call media controls | n/a (client) | ⚠️ decorative | ✅ (flag `mediaCall`) | Fixed (mute/camera/screen-share now wired) |
| TikTok / Kick **OAuth** | ❌ 501 | "Coming soon" | n/a | Not implemented (documented) |

## What changed

### Consolidated `/streaming` hub (routed like coalition/coliseum)

New top-level feature `apps/blackout-client/src/app/features/streaming/`
(`manifest.ts` / `routes.ts` / `nav.ts` / `panels.ts` / `StreamingView.tsx` /
`StreamingTabStrip.tsx`), registered in `core/features/coreModules.ts` behind a
new `streaming` flag (`core/features/featureFlags.ts`, default on,
`BLACKOUT_STREAMING` env override). It mirrors the coalition/coliseum pattern: a
sidebar destination (`panels.ts`, order 50) + nav item, with an internal tab
strip — simplified to an account-level hub (no per-room Matrix state gating). Tabs
mount the existing, prop-free components:

- **Live** — `LiveDirectory` (deep-link viewer `/live/:streamId` unchanged).
- **Broadcast** — Simulcast destinations, OBS-WS passwords, Twitch IRC bot tokens, widget-alert tokens.
- **Connections** — Linked accounts.
- **Bridges & Webhooks** — Twitch/YouTube/Kick chat bridges, Discord-compat + outbound webhooks.
- **Health** — Integrations-health dashboard.

A homepage "Quick actions" card links to `/streaming`
(`features/home/HomeFeed.tsx`, gated on the `streaming` flag).

### Call media controls wired to real tracks

`features/call/CallProvider.tsx`: mute toggles `MediaStreamTrack.enabled` on the
local audio tracks; the camera toggle re-acquires media with/without a video
track; screen-share captures via `getDisplayMedia`, publishes through the
existing `setLocalMediaStream` path, resets on the track's `ended` event, and
restores the device stream on stop/leave.

## Unreachable surfaces — investigate later

Recorded per request; **not addressed in this change**:

- [ ] Old settings shell `features/settings/Settings.tsx` + `account/Account.tsx`
      are now superseded by the `/streaming` hub for integrations and by
      `SettingsPage.tsx` for everything else. Decide whether to delete them.
- [ ] Settings dirs absent from the active `SettingsPage` sections — confirm each
      is reachable elsewhere or orphaned: `devices`, `emojis-stickers`, `general`,
      `security`, `creator-studio`, standalone `streamlabs`.
- [ ] `monetization/install/PluginCardRail.tsx` — appears unused by the homepage.
- [ ] TikTok and Kick **OAuth** flows return 501 (clients show "Coming soon").

## Live production findings (2026-05-24)

The `/streaming` hub is reachable in production (`chat.theblackout.app/streaming`),
but the deployed console surfaced two runtime issues:

- **`403` on `/v1/streaming/streams` (Live tab).** Server-side capability denial —
  `/v1/topics` (a pre-existing homepage feature) 403s for the same account, so the
  root cause is that the `streaming.read` / `topics.read` domain capabilities are not
  granted to the user. Product intent is that streaming is available to **all** users,
  so the real fix is **server-side capability provisioning** — *out of scope for the
  client change tracked here.* Client side, the Live directory and single-stream
  viewer now degrade gracefully on 403 ("Streaming isn't available on your account
  yet.") instead of dumping a raw `Request failed (403)` string
  (`LiveDirectory.tsx`, `LivestreamViewer.tsx`).
- **`429 Too Many Requests` on the Bridges & Webhooks tab.** The tab mounts five
  integration panels that each fetch on mount in the same tick; the SDK client's 3×
  retry multiplies the burst and trips the API rate limiter. **Fixed client-side** by
  mounting the stacked panels on a stagger (`features/streaming/StaggeredMount.tsx`,
  applied to the Broadcast and Bridges tabs in `StreamingView.tsx`).

Follow-ups still open: the individual integration panels still render their own raw
error text (contained, no longer bursting); and the server-side `streaming.read`
capability grant + any rate-limit tuning are tracked outside this client repo.

## Verification

- `vitest run src/app/features/streaming src/app/features/home src/app/features/call`
  and `tests/unit/core/features` — all green.
- `tsc --noEmit` (client typecheck) — clean.
- Pre-existing, unrelated failures observed in the sandbox: `CreatorListings.test.tsx`
  (`useConfirm`/`ConfirmProvider` harness issue — fails with this change stashed too)
  and the Playwright `tests/e2e/*.spec.ts` specs (run via `test:e2e`, not vitest).
- **Tooling limitation:** the repo's ESLint/Prettier config depends on
  `eslint-plugin-matrix-org`, which is not installed (or declared) in this
  sandbox, so `eslint`/`prettier` and the lint-staged pre-commit hook cannot run
  here. Formatting follows the surrounding code by hand.
- **Live-media limitation:** no real LiveKit/Owncast SFU or capture devices in the
  sandbox, so the call media-control fix is covered only by unit tests with mocked
  `mediaDevices`; live multi-party verification is still required before sign-off.
