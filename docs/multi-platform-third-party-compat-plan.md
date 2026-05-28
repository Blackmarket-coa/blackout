# Plan: Multi-Platform 3rd-Party Software Compatibility Layer

## Context

A potential streamer-customer is evaluating Blackout. Their concern: they
currently rely on a large ecosystem of tools layered on top of Twitch (Blerp,
Crowd Control, Sound Alerts, Destiny 2 extensions, dashboards, chat-interaction
widgets, Streamlabs/StreamElements alerts, Discord bots like MEE6, Patreon role
sync, etc.). They will not switch platforms if migrating means losing that
breadth — and they implicitly asked "what funds your servers?" (i.e. the
business model has to be credible enough to outlast the incumbents).

We promised them: **"use other platforms WITH Blackout until we build enough to
replace all the conveniences."** This plan operationalizes that promise across
all major competitor ecosystems — Twitch, Discord, Patreon, TikTok, YouTube
Live, Kick, OBS — as two parallel tracks:

- **Track A (Simulcast / Co-existence)** — creator keeps streaming to
  Twitch/YT/Kick; Blackout fans out RTMP, mirrors chat/events back into the
  Blackout den, and adds parallel monetization. Their existing 3rd-party
  software keeps working *unchanged* because the creator is still on those
  platforms. Adoption cost = zero.
- **Track B (Compatibility shims)** — wire-protocol-compatible surfaces inside
  Blackout (Twitch Extensions iframe SDK, Discord Bot gateway, OBS-WebSocket
  v5, Streamlabs alert socket) so the long tail of tools can run *natively
  against Blackout* with no code change from extension authors. This is the
  on-ramp to going Blackout-only.

The "what funds the servers" answer is the **monetization consolidator** built
on top of these tracks: Twitch keeps ~50% of subs, Stripe-via-Patreon ~8-12%
effective; Blackout-direct can run at ~5% because we host on commodity infra
(LiveKit, Owncast already deployed) and our marginal cost per tip is cents.
The cut difference funds infrastructure and is *visible savings* to the creator.

## Existing Blackout building blocks (verified)

- Plugin sandbox: `iframe sandbox="allow-scripts"` with capability-gated
  postMessage RPC at
  `apps/blackout-client/src/app/features/monetization/install/sandbox/PluginSandboxHost.ts`.
- Manifest + capability + signed bundle protocol at
  `packages/blackout-protocol/src/plugins/index.ts` (capabilities:
  `shell.panel.read/write`, `message.read/compose`, `storage.read/write`,
  `http.fetch`; Ed25519/HMAC signed envelopes; `PLUGINS_PROTOCOL_VERSION = 1`).
- App OAuth + HMAC-SHA256 webhook contract with replay window and install
  lifecycle at `packages/api/src/services/apps.ts`.
- Mautrix bridges deployed for Discord/Slack/Telegram/Signal/WhatsApp/Google
  Chat under `deploy/docker/blackout-backend/integrations/`. Hookshot for
  inbound webhooks.
- LiveKit voice/video at `packages/api/src/services/livekit.ts`. Owncast RTMP
  ingest at `packages/api/src/integrations/owncast.ts`.
- Stream viewer at `apps/blackout-client/src/app/features/streams/LivestreamViewer.tsx`
  (currently no panel/overlay/component slots).
- Right-panel slot system at `apps/blackout-client/src/app/pages/shell/DynamicRightPanel.tsx`.
- Internal-only public-shaped SDK at `packages/blackout-sdk/`.

## What's missing

- Zero Twitch / YouTube / TikTok / Patreon / Kick / Streamlabs / StreamElements / OBS integrations.
- No Twitch-style extension surfaces on the livestream page.
- No chat bot / command middleware pipeline.
- No simulcast / RTMP fan-out / cross-post / unified-creator-identity layer.
- SDK is not externally publishable yet.

---

## 1. Catalog of 3rd-party software categories

Approach legend: **passthrough** = Track A only (works because creator stays
on incumbent), **shim-native** = Track B (runs against Blackout), **both** =
ship in both tracks, **not-feasible** = closed/in-process, parked.

| # | Platform | Category | Examples | Approach | Effort |
|---|---|---|---|---|---|
| 1 | Twitch | Panel extensions (below player) | Sound Alerts, Streamlabs Tip Page, Marathon | shim-native | L |
| 2 | Twitch | Video-overlay extensions | Crowd Control, PulsoidStream, OWN3D | shim-native | L |
| 3 | Twitch | Component extensions (anchored hotspots) | Stream Avatars, Chat Boxes | shim-native | M |
| 4 | Twitch | Mobile extensions | Predictions, Polls native UI | shim-native | M |
| 5 | Twitch | IRC/IRCv3 chat bots | Nightbot, StreamElements bot, Moobot, Fossabot | shim-native (IRC bridge) | M |
| 6 | Twitch | EventSub subscribers | StreamLabs alerts, custom Lambda integrations | both | M |
| 7 | Twitch | Helix REST consumers | Bot dashboards, schedule pullers | shim-native (Helix proxy) | L |
| 8 | Twitch | Bits / Hype Train integrations | Bits leaderboards, hype-train widgets | shim-native (map to coliseum/boosts) | M |
| 9 | Twitch | Affiliate/Partner dashboards | Twitch Inspector tooling | not-feasible (proprietary) | — |
| 10 | Discord | Bots — gateway WSS | MEE6, Dyno, Carl-bot, ProBot | shim-native (fork Spacebar gateway) | M |
| 11 | Discord | Bots — interactions HTTP (slash cmds) | YAGPDB, modern bots | shim-native | M |
| 12 | Discord | Activities / Embedded App SDK | Watch Together, Poker Night, custom games | shim-native (iframe in voice room) | L |
| 13 | Discord | Webhooks (inbound) | GitHub→Discord, IFTTT, Zapier | shim-native (URL-compatible) | S |
| 14 | Discord | OAuth2 third-party login ("Sign in with Discord") | Patreon link, web tools | both | S |
| 15 | Discord | RPC / Rich Presence | Game presence, Spotify status | shim-native (local RPC socket) | M |
| 16 | Discord | Voice (Lavalink music bots) | Rythm successors | shim-native via LiveKit bridge | L |
| 17 | Discord | Patreon-Discord role sync | Official Patreon integration | both | S |
| 18 | OBS | obs-websocket v5 controllers | Stream Deck, Touch Portal, Loupedeck | shim-native | M |
| 19 | OBS | Native C++ plugins | Move Transition, NDI, StreamFX | not-feasible (in-process) | — |
| 20 | OBS | Browser sources (CEF) | All alert widgets | both | S |
| 21 | OBS | Lua/Python scripts | Auto-scene-switchers | not-feasible (in-process) | — |
| 22 | Streamlabs | Alert widget (browser-source URL) | Donation/follow/sub alerts | shim-native (socket.io API) | M |
| 23 | StreamElements | Overlay studio + chat bot | Tip-jar, leaderboards, loyalty | shim-native | L |
| 24 | Patreon | Webhooks (`pledges:create` etc.) | Member-area gating | shim-native | S |
| 25 | Patreon | OAuth API consumers | Memberful, tier-gated discord roles | both | S |
| 26 | TikTok | Live gift/sub events | TikFinity, custom gift overlays | shim-native (unofficial WS) | M |
| 27 | TikTok | Live Studio plugins | Effects, overlays | not-feasible (closed, mobile-only) | — |
| 28 | YouTube | SuperChat / membership webhooks | Chat overlays, member alerts | shim-native | M |
| 29 | YouTube | Live Streaming API (RTMP + chat) | OBS YT plugin, mod tools | passthrough | S |
| 30 | Kick | Pusher-based chat WS | Botrix, custom bots | shim-native (Pusher protocol) | M |
| 31 | Kick | Webhook events | Tip notifiers | shim-native | S |
| 32 | Game | Crowd Control SDK | Crowd Control client + game studio | shim-native (CC websocket) | L |
| 33 | Donations | StreamLabs Tipping, Ko-fi, Throne, BMC | Embedded tip pages, alerts | both | M |
| 34 | Music | Spotify "Now Playing" widgets | Pulsoid, Spotify-overlay | passthrough (browser-source) | S |

---

## 2. Deep-dive on the top 3 highest-leverage categories

### 2.1 Twitch Extensions iframe shim

**Wire to mimic:** `Twitch.ext` JS SDK
(`https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js`). Surfaces:
`panel`, `video_overlay`, `component`, `mobile`, `config`, `live_config`. Key
APIs: `onAuthorized`, `onContext`, `actions.requestIdShare`, `bits.useBits`,
`viewer.subscriptionStatus`, `configuration.broadcaster`, `rig.log`. EBS JWT
HS256 with claims `{exp, channel_id, role, user_id, opaque_user_id, pubsub_perms}`.

**Where it plugs in:**
- Extend `apps/blackout-client/src/app/features/streams/LivestreamViewer.tsx`
  to render `<ExtensionPanelStack>` below the player and `<ExtensionVideoOverlay>`
  absolutely-positioned over the player.
- New iframe component:
  `apps/blackout-client/src/app/features/streams/extensions/ExtensionFrame.tsx`.
- Reuse `PluginSandboxHost.ts` as the trusted host; add a *compat profile* that
  injects a `Twitch.ext` shim script into the sandbox `srcdoc` *before* the
  extension bundle. The shim translates Twitch SDK calls into the existing
  `parent.postMessage({kind:'rpc-request', ...})` pipe.
- New manifest variant in `packages/blackout-protocol/src/plugins/index.ts`:
  `artifactKind: 'twitch_extension_compat'` with extra fields
  `{twitchClientId, twitchSecret(server-side only), surfaces}`.
- Catalog/version: new service `packages/api/src/services/twitchExtensions.ts`.
- Helix REST proxy: `packages/api/src/integrations/twitch/helixProxy.ts` —
  translate read endpoints (`/users`, `/streams`, `/subscriptions`) to
  Blackout equivalents; deny writes.
- EBS bridge: `packages/api/src/integrations/twitch/ebsJwt.ts` — sign JWTs
  with per-installation HS256 secret; route extension PubSub broadcasts into
  Matrix room state events on the den.

**Capabilities (new):** `twitch.ext.bits`, `twitch.ext.subscriptionStatus`,
`twitch.ext.identityShare`, `twitch.ext.pubsubBroadcast`. Capability check
remains host-side; the in-iframe shim is a translation layer only.

**Identity bridging:**
- `opaque_user_id` = `'U' + HMAC-SHA256(extensionSecret, blackoutUserId || channelId)`.
- `user_id` = linked Twitch user id from `linkedAccounts` table (only if viewer consented to identity-share).
- `channel_id` = deterministic mapping from Blackout creator id.
- `role` = `broadcaster` if viewer == creator, `moderator` if Matrix PL ≥ 50, else `viewer`.

**Failure modes:** EBS-secret leakage (mitigation: never reach iframe), shim
sandbox escape (mitigation: capability gating remains host-side), Helix proxy
abuse (rate-limit per install, deny writes), Twitch ToS exposure (see §6).

### 2.2 Discord Bot gateway/interactions shim

**Wire to mimic:** Discord Gateway v10 (WSS, opcode-framed JSON:
`HELLO`/`IDENTIFY`/`HEARTBEAT`/`DISPATCH` with `MESSAGE_CREATE`,
`GUILD_MEMBER_ADD`, `INTERACTION_CREATE`) plus REST (`/api/v10/channels/{id}/messages`,
`/guilds/{id}/members/...`, `/interactions/{id}/{token}/callback`). For
interactions-only bots: HTTP signed webhook (`X-Signature-Ed25519`).

**Where it plugs in:**
- New service `apps/blackout-server/src/discordCompat/{gateway,rest,interactions,mapping}/`,
  deployed alongside `apps/deaddrop-appservice` behind nginx.
- The existing `mautrix-discord` bridge is the *outbound* mirror (Blackout user
  appears on real Discord); this shim is the *inbound* mirror (Discord-bot-author's
  bot connects to `wss://compat.blackout.example/?v=10&encoding=json` and sees
  Blackout community events shaped as Discord events).
- ID mapping at `packages/api/src/integrations/discord-compat/idMapping.ts`:
  - Blackout Canopy ↔ Discord Guild (snowflake encoded from
    `(canopyCreatedAtMs - DISCORD_EPOCH) << 22 | shard << 17 | inc`)
  - Matrix room ↔ Channel; Matrix space ↔ Category
  - Matrix user ↔ User; roles map onto Matrix power levels + `services/roles.ts`
  - Persist mappings; never re-derive on read.
- Bot tokens reuse the `apps.ts` OAuth + HMAC webhook contract. New table
  `discord_compat_bots(blackoutAppId, fakeApplicationId, fakeBotUserId, gatewayToken)`.
- Slash cmds: `PUT /applications/{app.id}/commands` registers into
  Blackout's `appActions` registry so commands appear in the Blackout
  command palette and as Matrix `m.command` events.

**Sandboxing:** Out-of-process; per-bot quotas via `recordActionExecution()`.
IDENTIFY rate-limit (1/5s like Discord). Heartbeat enforcement. Per-bot
connection cap.

**Event mapping:**
- `m.room.message` → `MESSAGE_CREATE`
- Matrix join → `GUILD_MEMBER_ADD`
- Reaction → `MESSAGE_REACTION_ADD`
- Typing → `TYPING_START`
- Tip → custom Blackout-extended OPCODE (standard bots ignore)
- Bot's outbound `POST /channels/{id}/messages` → `m.room.message`
  via `packages/api/src/integrations/matrix-client.ts`.

**Failure modes:** Discord ToS exposure (§6 — biggest legal risk in the
deck), snowflake collision (persistent mapping store), bot token theft
(rotation-aware, encrypted), interactions replay (reuse the 5-min
window from `apps.ts`), gateway DoS.

### 2.3 OBS browser-source + RTMP fan-out (Track A backbone)

**Wires to mimic:** (a) OBS-WebSocket v5 (JSON-over-WS, opcode framed:
`Hello`/`Identify`/`Identified`/`Request`/`RequestResponse`/`Event`).
(b) Streamlabs Socket API (socket.io namespace, `event` payloads
`{type:'donation'|'follow'|'subscription', message:[...]}`).
(c) StreamElements OverlayWS (socket.io, JWT via channel id).

**Where it plugs in:**
- New worker `apps/blackout-server/rtmp-fanout/` in front of Owncast.
  Single RTMP ingest from creator's encoder; ffmpeg `-c copy` per
  destination to Twitch / YT / Kick / Owncast origin. Per-creator
  destinations stored encrypted in
  `packages/api/src/services/simulcastDestinations.ts`.
- Browser-source endpoints: `apps/blackout-server/src/routes/widgets.ts` —
  `GET /widgets/alerts/:token` returns a single-page widget; the widget
  connects back to `WSS /widgets/alerts/:token/ws` speaking Streamlabs
  + StreamElements payload shapes simultaneously.
- OBS-WebSocket v5 server: new package `packages/obs-ws-compat/` in
  `blackout-desktop`, exposing `ws://localhost:4455` to local OBS.
  Translates `StartStream`/`StopStream`/`GetSceneList`/`SetCurrentProgramScene`
  to Blackout RPC.
- Alert pipeline: tips (`packages/api/src/services/tips.ts`), follows
  (canopy member-join), gifts (`packages/api/src/services/gifts.ts`)
  fan out to a hub that emits Streamlabs-shaped, StreamElements-shaped,
  and Blackout-native events in parallel.

**YouTube special case:** YT Live ToS forbids server-side re-broadcast. Use
multi-RTMP-target *at the encoder* for YT, not server-side fan-out.

**Failure modes:** RTMP key leakage (KMS-encrypted at rest, redacted in
logs, 90-day rotation), ffmpeg supply chain (SHA-pinned, distroless,
unprivileged), bandwidth amplification (per-creator caps), widget
token theft (stream-scoped, short-lived, revocable on WS connect).

---

## 3. Track A (Simulcast) architecture summary

- **Fan-out worker** at `apps/blackout-server/rtmp-fanout/`.
- **Chat ingress** per platform under
  `packages/api/src/integrations/{twitch,youtube,kick,tiktok}/chatReader.ts`,
  normalized via `packages/api/src/integrations/normalizedChat.ts` into
  Matrix `m.room.message` with `m.blackout.origin` field. Render in
  `LivestreamViewer.tsx` chat pane with origin badges.
- **Event ingress** per platform: `eventSubReceiver.ts` (Twitch),
  `pubsubReceiver.ts` (YT), `webhookReceiver.ts` (Kick),
  `giftReceiver.ts` (TikTok). HMAC-verify per spec, normalize to a single
  `BlackoutExternalEvent` schema.
- **Outbound mirror** (opt-in): Matrix → Twitch IRC / YT
  `liveChatMessages.insert` / Kick.
- **Unified analytics**: new
  `apps/blackout-client/src/app/features/streams/SimulcastDashboard.tsx`.

## 4. Track B (Compat shims) summary

Beyond the 3 deep-dives:
- **Twitch IRC bot shim**: `apps/blackout-server/twitchIrcCompat/` —
  RFC1459 + IRCv3 tags Twitch-style. Bots IDENTIFY with `oauth:<blackout-token>`.
- **Patreon webhook compat**: `packages/api/src/integrations/patreon/compat.ts`
  emits Patreon-shaped webhooks from internal tier-change events.

## 5. Identity & monetization bridge

- **`linkedAccounts` table** (new): `(blackoutUserId, provider, providerUserId,
  accessTokenEnc, refreshTokenEnc, scopes, expiresAt)` for `twitch`, `youtube`,
  `discord`, `patreon`, `tiktok`, `kick`. Generalizes
  `packages/api/src/services/auth.ts`.
- **Tier sync** at `packages/api/src/services/tierSync.ts`:
  - Patreon `members:pledge:create` → `roles.assign`
  - Twitch `channel.subscribe` → Blackout creator-sub equivalent
  - YT membership → role grant
  - No reverse echo (creator chooses to migrate audience, not double-bill).
- **Tip consolidator** (extend `packages/api/src/services/tips.ts`) with three
  modes: display-only (Blackout takes 0%), co-branded (5% — competitive vs
  Twitch ~50%, Stripe-via-Patreon ~8-12%), migrated (Blackout-only path).
  **This is the answer to the creator's "what funds the servers?" question:**
  the 5% cut on consolidated payouts, made viable by commodity infra
  (LiveKit + Owncast already deployed), and visible as savings to the creator.

---

## 6. Open risks

- **Twitch Developer Agreement §III** restricts hosting Twitch extensions
  outside Twitch infra. Mitigation: (a) creator-by-creator legal indemnity,
  (b) opt-in registry for OPEN-SOURCE extensions only, (c) for closed
  extensions, Track A passthrough only (creator stays on Twitch).
- **Discord Developer ToS §6** forbids "scraping, copying, or imitating" the
  API. The compat shim must be marketed as a *Blackout-internal protocol that
  happens to be Discord-shaped for portability*, never connect outbound to
  Discord's servers, never use Discord trademarks. Pre-launch trademark + ToS
  review is mandatory.
- **Patreon ToS** restricts re-mirroring of patron data. Tier-sync only after
  creator + patron both consent at OAuth time.
- **YouTube Live API ToS** forbids redirecting live streams. Track A simulcast
  must originate the upload at the encoder, not re-broadcast from Blackout's
  ingest. Multi-RTMP-target at encoder for YT specifically.
- **TikTok** has no public Live API; the chatReader uses an unofficial WS that
  may break or trigger anti-abuse. Document as best-effort.
- **Sandbox escape** from the Twitch-ext compat profile (the injected shim
  widens API surface inside the iframe). Audit the shim with the same rigor
  as the host RPC.
- **Bot token theft** (Discord shim grants full firehose). Rotate per-install,
  encrypted at rest, never logged.
- **Compat drift** — Twitch/Discord change wire shapes monthly. Need a
  compat-test harness that records traces from consenting creator accounts
  and replays weekly.
- **Supply chain**: SHA-pin every shim dep, ffmpeg, hls.js, twitch.ext shim.
  SBOM per shim.

---

## 7. Critical files

**Modify:**
- `apps/blackout-client/src/app/features/streams/LivestreamViewer.tsx` — add panel/overlay slots
- `apps/blackout-client/src/app/features/monetization/install/sandbox/PluginSandboxHost.ts` — add Twitch-ext compat profile + shim injection
- `packages/blackout-protocol/src/plugins/index.ts` — `twitch_extension_compat` artifact kind + new capabilities
- `packages/api/src/services/apps.ts` — extend OAuth providers + `discord_compat_bot` install variant
- `apps/blackout-client/src/app/pages/shell/DynamicRightPanel.tsx` — wire `livestream-chat` slot to real chat with origin badges
- `packages/api/src/integrations/owncast.ts` — front with fan-out worker config

**Create:**
- `apps/blackout-server/rtmp-fanout/` — RTMP fan-out worker
- `apps/blackout-server/src/discordCompat/{gateway,rest,interactions,mapping}/`
- `apps/blackout-server/twitchIrcCompat/` — IRC bot shim
- `apps/blackout-client/src/app/features/streams/extensions/ExtensionFrame.tsx`
- `apps/blackout-client/src/app/features/streams/SimulcastDashboard.tsx`
- `packages/api/src/services/twitchExtensions.ts`
- `packages/api/src/services/simulcastDestinations.ts`
- `packages/api/src/services/tierSync.ts`
- `packages/api/src/integrations/twitch/{helixProxy,ebsJwt,eventSubReceiver,chatReader}.ts`
- `packages/api/src/integrations/youtube/{chatReader,pubsubReceiver}.ts`
- `packages/api/src/integrations/kick/{chatReader,webhookReceiver}.ts`
- `packages/api/src/integrations/tiktok/{chatReader,giftReceiver}.ts`
- `packages/api/src/integrations/patreon/compat.ts`
- `packages/api/src/integrations/discord-compat/idMapping.ts`
- `packages/api/src/integrations/normalizedChat.ts`
- `apps/blackout-server/src/routes/widgets.ts` — Streamlabs/SE-shaped alert WS
- `packages/obs-ws-compat/` — OBS-WebSocket v5 server in desktop helper
- `packages/blackout-sdk/` — flip from internal to publishable; Twitch.ext
  shim, Discord-bot adapter, widgets quickstart

---

## 8. Phased rollout (4 quarters)

**Phase 0 — Foundations (Q1)**
- Public SDK extraction from `packages/blackout-sdk/`
- `linkedAccounts` table + OAuth-link UI for Twitch/Discord/Patreon/YT
- Extension surface slots in `LivestreamViewer.tsx` (panel, video-overlay) wired to placeholder iframes
- Capability extensions + manifest variant in `blackout-protocol`
- `simulcastDestinations.ts` schema + admin UI; no fan-out worker yet
- Threat model update for Twitch/Discord ToS exposure (legal sign-off gate)

**Phase 1 — Twitch simulcast + extension shim MVP (Q2)**
- RTMP fan-out worker live; restream Owncast → Twitch + YT
- Twitch IRC chat ingress + outbound mirror
- Twitch EventSub ingress (follow/sub/raid)
- Twitch Extensions iframe shim + Twitch.ext SDK polyfill (panel + video-overlay)
- EBS JWT signer + Helix read-proxy for `/users`, `/streams`
- Widget alert URLs (Streamlabs-shaped) — Tier-1 alert types only
- Tip consolidator co-branded mode

**Phase 2 — Discord bot shim + Patreon (Q3)**
- Discord gateway WSS server + REST shim (read events: MESSAGE_CREATE, GUILD_MEMBER_ADD, INTERACTION_CREATE)
- Discord interactions HTTP webhook (signed Ed25519)
- Slash command palette integration
- Patreon webhook compat + tier-sync to roles
- Discord bot quotas + observability via existing `apps.ts` metrics
- Twitch component + mobile extension surfaces

**Phase 3 — TikTok / YT / Kick / OBS (Q4)**
- YT Live SuperChat + membership webhook ingress
- Kick chat (Pusher) + webhook ingress
- TikTok Live gift WS ingress
- OBS-WebSocket v5 server in `blackout-desktop`
- StreamElements OverlayWS compat (extends widgets endpoint)
- Crowd Control integration shim (game-side SDK adapter)
- Discord Activities embedded-app shim in voice rooms

---

## 9. Open-source projects we can adopt (gap-fill leverage)

The compat layer is far less work than it looks because most categories already
have mature OSS we can fork, embed, or wrap. License compatibility checked
against Blackout's existing AGPL-3.0 license posture.

| Gap | Project | License | Role |
|---|---|---|---|
| **Discord-API compat (gateway+REST+CDN)** | [`spacebarchat/spacebarchat`](https://github.com/spacebarchat/spacebarchat) | AGPL-3.0 | **Killer find.** Full Discord-compatible TS implementation of API + Gateway (WSS) + CDN. Already production-ready for small-medium communities (per 2026 reviews). Fork the gateway + REST modules, swap the data layer to Blackout's Matrix-backed mapping (`discord-compat/idMapping.ts`). Collapses Discord shim from XL → M. AGPL-3.0 matches our license. |
| **Twitch Helix + EventSub + IRC chat** | [`twurple/twurple`](https://github.com/twurple/twurple) | MIT | All Twitch wire protocols in one Node lib. Use directly in `packages/api/src/integrations/twitch/{helixProxy,eventSubReceiver,chatReader}.ts`. Includes `@twurple/eventsub-ws`, `@twurple/api`, `@twurple/chat`, `@twurple/auth-tmi` for tmi.js compat. |
| **Twitch extension dev rig (JWT, opaque_user_id, mock APIs)** | [`twitchdev/developer-rig`](https://github.com/twitchdev/developer-rig) (forks at azarusio/emogi) | Apache 2.0 (archived but functional) | Reference implementation of EBS JWT signer + Twitch.ext local-mode mock. We don't redistribute Twitch's `twitch-ext.min.js` (proprietary), but the Rig demonstrates the wire shape. Use it as our shim spec. |
| **RTMP fan-out / multi-destination simulcast** | [`bluenviron/mediamtx`](https://github.com/bluenviron/mediamtx) | MIT | Go, zero-dep, ready-to-use SRT/WebRTC/RTSP/RTMP/LL-HLS/HLS. Use as the fan-out engine inside `apps/blackout-server/rtmp-fanout/`; we own only the per-creator destination config + auth. |
| **Restreamer with creator UI (alternative)** | [`datarhei/restreamer`](https://github.com/datarhei/restreamer) | Apache 2.0 | Full self-host with management UI for multi-destination. Possible drop-in if we want a faster MVP than wrapping MediaMTX ourselves. |
| **OBS-WebSocket v5 client** | [`obs-websocket-community-projects/obs-websocket-js`](https://github.com/obs-websocket-community-projects/obs-websocket-js) | MIT | TS client. Used inversely: our desktop helper *speaks* the OBS-WebSocket v5 protocol (server side). Reference [`obsproject/obs-websocket`](https://github.com/obsproject/obs-websocket) (GPL-2.0 — protocol spec only, we re-implement the server). |
| **TikTok Live (chat/gifts/subs)** | [`zerodytrash/TikTok-Live-Connector`](https://github.com/zerodytrash/TikTok-Live-Connector) | MIT | Node, no credentials needed; reverse-engineered Webcast WS. Use directly in `packages/api/src/integrations/tiktok/{chatReader,giftReceiver}.ts`. Best-effort by nature. |
| **TikTok Live (Python alt)** | [`isaackogan/TikTokLive`](https://github.com/isaackogan/TikTokLive) | MIT | Python equivalent if we end up running a Python ingress sidecar. |
| **YouTube Live chat (InnerTube, no quota)** | [`Agash/YTLiveChat`](https://github.com/Agash/YTLiveChat) | MIT | .NET; port the InnerTube parsing logic. Avoids the Data API quota tax. SuperChat + memberships supported. |
| **YouTube Live chat (Node, official API)** | [`DustinWatts/YouTubeLiveChat`](https://github.com/DustinWatts/YouTubeLiveChat) | MIT | Lightweight Node lib over the official `liveChatMessages.list` endpoint. Fallback when InnerTube breaks. |
| **Kick chat (Pusher WS)** | [`@retconned/kick-js`](https://www.npmjs.com/package/@retconned/kick-js) | MIT | TypeScript Kick chat lib. Use directly in `packages/api/src/integrations/kick/chatReader.ts`. |
| **Patreon OAuth + webhooks** | [`Patreon/patreon-js`](https://github.com/Patreon/patreon-js) (official) | Apache 2.0 | Official OAuth client. Use for `linkedAccounts` Patreon provider. |
| **Patreon TS rewrite (with webhook server helpers)** | [`ghostrider-05/patreon-api.ts`](https://github.com/ghostrider-05/patreon-api.ts) | MIT | Modern TS rewrite with first-class webhook server helpers (Express + Cloudflare Workers examples). Recommended over the official lib for new code. |
| **Crowd Control SDK (server simulator)** | [`qixils/java-crowd-control`](https://github.com/qixils/java-crowd-control) | MIT | Java lib for both consuming and simulating crowdcontrol.live. Reference for our shim if we replicate the protocol; otherwise integrate as a Crowd Control partner. |
| **Crowd Control reference integration** | [`qixils/minecraft-crowdcontrol`](https://github.com/qixils/minecraft-crowdcontrol) | MIT | End-to-end example wiring Twitch/YT/TikTok/Discord donations into game effects. |
| **Streamer.bot-shaped OBS chat overlay** | [`izzy/stream-chat`](https://github.com/izzy/stream-chat), [`DavidPatzke/twitch-chat`](https://github.com/DavidPatzke/twitch-chat) | MIT | Drop-in OBS browser-source overlays that connect to Streamer.bot's WS. We can ship a Blackout-flavored fork that connects to our widgets endpoint. |
| **Streaming bot (full)** | [Mix It Up](https://mixitupapp.com/) | MIT | Open-source full-feature streaming bot (Twitch/YT). Can be packaged as a Blackout companion. |
| **Streamlabs alert socket protocol** | [Streamlabs Socket API docs](https://dev.streamlabs.com/docs/socket-api) | (spec) | Public spec; we implement to it. No OSS to fork because the protocol is documented. Same for StreamElements OverlayWS. |
| **Discord bridge (outbound)** | already deployed: `mautrix-discord` at `deploy/docker/blackout-backend/integrations/mautrix-discord` | AGPL-3.0 | Existing — Blackout user → real Discord. Spacebar fork is the *complement* (3p bot → Blackout). |
| **Public webhooks ingress** | already deployed: Hookshot at `deploy/docker/blackout-backend/integrations/hookshot` | Apache 2.0 | GitHub/GitLab/Jira/feed webhooks. Reuse for Patreon/Kick/YT generic webhooks before per-platform parsers ship. |
| **Broadcast-graphics framework (HUGE)** | [`nodecg/nodecg`](https://github.com/nodecg/nodecg) | MIT | Industry-standard framework for browser-based broadcast overlays (used by Games Done Quick, esports orgs, Tip of the Hats). "Bundles" are self-contained graphics + dashboard panels + server logic. There is an entire **awesome-nodecg** ecosystem of pre-built overlays. **If we expose a NodeCG-shape replicants WS, every existing NodeCG bundle becomes a Blackout overlay for free.** Ship Blackout as a NodeCG host (or a NodeCG-compatible host) and we inherit a decade of community work. |
| **NodeCG bundle catalog** | [`nodecg/awesome-nodecg`](https://github.com/nodecg/awesome-nodecg) | (curated list) | Hundreds of community bundles — alerts, timers, donation tickers, esports scoreboards. Validates the value of NodeCG-compat. |
| **Stream Deck / control surface (HUGE)** | [`bitfocus/companion`](https://github.com/bitfocus/companion) | MIT | OSS control-surface software with **600+ device integrations** for Elgato Stream Deck and equivalents. Already speaks OBS-WebSocket. **If our OBS-WebSocket v5 server is wire-compatible, every existing Companion preset works against Blackout out of the box.** Additionally, we should publish a `companion-module-blackout` adapter to the Companion module registry — instant control-surface support for the entire pro-streaming community. |
| **Bitcoin tipping (zero-fee, self-hosted)** | [`btcpayserver/btcpayserver`](https://github.com/btcpayserver/btcpayserver) | MIT | Self-hosted, no-fee Bitcoin payment processor with built-in tipping buttons, payment links, and crowdfunding. Plugin system for new payment methods. **Solves the "what funds the servers" angle from a different direction**: gives creators a *truly 0% take-rate* tipping path immediately, while Blackout monetizes via subs/co-branded fiat tips. Major differentiator vs Twitch/Patreon. |
| **WebRTC guest streaming** | [`steveseguin/vdo.ninja`](https://github.com/steveseguin/vdo.ninja) | AGPL-3.0 | Browser-based peer-to-peer video bring-in for OBS / browser-sources. Critical for co-stream / podcast / interview workflows. Can be self-hosted; supports WHIP/WHEP. Embed for "bring guest into your stream" without OBS-NDI complexity. |
| **Federated video / VOD layer** | [`Chocobozzz/PeerTube`](https://github.com/Chocobozzz/PeerTube) | AGPL-3.0 | ActivityPub-federated video platform with live streaming and P2P delivery (cuts CDN cost when a stream goes viral). Could serve as Blackout's VOD + federation layer; would let Blackout streams appear on Mastodon/Lemmy/Misskey timelines via ActivityPub — a federation moat Twitch can't match. |
| **Generic Matrix bridge framework** | [`matrix-org/matrix-appservice-bridge`](https://github.com/matrix-org/matrix-appservice-bridge) | Apache 2.0 | The framework underlying every Mautrix bridge. Use directly to build any new bridge (e.g., a custom Twitch chat bridge if Twurple isn't enough, or a TikTok bridge). Provides intent-based Matrix API + virtual user state + request metrics out of the box. |
| **Live captions / translation** | [`royshil/obs-localvocal`](https://github.com/royshil/obs-localvocal) + [`ggml-org/whisper.cpp`](https://github.com/ggml-org/whisper.cpp) | MIT / MIT | OBS plugin for local Whisper.cpp captioning + 100-language translation. Ingest as a caption track on Blackout streams to differentiate on accessibility. Runs locally — zero per-minute cloud cost. |
| **Owncast embeds + modular architecture** | [`owncast/owncast`](https://github.com/owncast/owncast) | MIT | Already deployed in Blackout. Native iframe embed for video + chat; modular architecture for plugins. Reuse the iframe-embed surface so existing Owncast embed users get Blackout streams for free. |
| **Discord bot test harness** | [`discordjs/discord.js`](https://github.com/discordjs/discord.js), [`abalabahaha/eris`](https://github.com/abalabahaha/eris), [`Rapptz/discord.py`](https://github.com/Rapptz/discord.py) | Apache 2.0 / MIT / MIT | Run all three unmodified against the Spacebar fork as our compat-test matrix. Wire-shape regressions get caught before release. |
| **Twitch chat bots (compat targets)** | [`PhantomBot/PhantomBot`](https://phantombot.dev/), Mix It Up, Fossabot, Sery_Bot | various MIT/MS-PL | Open-source Twitch chat bots. Use as compat targets for our Twitch IRC shim — if PhantomBot connects to `wss://compat.blackout/twitch-irc` and works without modification, the shim is good. |
| **OSS streaming bot (companion app)** | [Mix It Up](https://mixitupapp.com/) | MIT | Full-featured open-source streaming bot for Twitch/YT. Could be packaged as the "Blackout companion bot" with a Blackout connector PR upstream. |
| **Streamer.bot ecosystem (compat target)** | Streamer.bot WS overlays (e.g., [`izzy/stream-chat`](https://github.com/izzy/stream-chat), [`DavidPatzke/twitch-chat`](https://github.com/DavidPatzke/twitch-chat)) | MIT | Streamer.bot exposes a WS that hundreds of community overlays consume. If our widgets endpoint speaks the same shape, those overlays drop in unchanged. |

### Three "stealth-leverage" picks worth calling out

1. **NodeCG host compatibility** is the cheapest 10x for the alert/overlay
   ecosystem. NodeCG bundles use a documented "replicants" message bus over
   socket.io. If `apps/blackout-server/src/routes/widgets.ts` exposes a
   NodeCG-shape WS in addition to the Streamlabs/StreamElements shapes, we
   inherit a decade of pre-built broadcast graphics work that already serves
   Twitch creators. Cost: a single protocol adapter file. Value: matches
   StreamElements' overlay studio without us building one.

2. **Bitfocus Companion module** is a free distribution channel into the
   pro-streaming community. Companion has 600+ existing modules and a public
   module registry. A `companion-module-blackout` upstream PR puts Blackout
   into every Stream Deck workflow on day one — zero ongoing maintenance once
   merged. Combined with our OBS-WebSocket v5 server, every existing Companion
   preset using OBS-WS targets just point at Blackout's port instead.

3. **PeerTube federation** reframes the value proposition. Today: Blackout vs
   Twitch. With PeerTube ActivityPub federation: Blackout streams appear in
   Mastodon timelines, Lemmy communities, Misskey feeds, and other PeerTube
   instances. Twitch *cannot* federate (centralized by design); this is a
   permanent moat once shipped. We can either embed PeerTube or implement the
   live-streaming subset of ActivityPub ourselves.

### Build vs. adopt decisions

- **Adopt Spacebar fork** for the Discord gateway/REST/CDN. *Do not* run vanilla
  Spacebar — fork the gateway + REST, swap the persistence layer to a Matrix
  adapter so events flow through Blackout's existing rooms/spaces. Keep
  Spacebar's wire protocol bit-exact; replace its DB. AGPL obligations are
  fine: we already publish under AGPL.
- **Adopt MediaMTX** for fan-out; build only the per-creator destination
  manager + auth glue around it. Faster than ffmpeg-wrangling, also unlocks
  WebRTC playback as a side benefit.
- **Adopt Twurple** for all Twitch protocols. Don't write IRC parsing or
  EventSub HMAC verification ourselves.
- **Adopt TikTok-Live-Connector** for TikTok ingress; document it as
  best-effort and isolate it in its own crash-restartable worker.
- **Adopt patreon-api.ts** for Patreon OAuth + webhooks.
- **Adopt @retconned/kick-js** for Kick chat.
- **Adopt NodeCG protocol compat** (not the framework binary — we expose a
  NodeCG-shape WS adapter so existing bundles "just work").
- **Adopt Bitfocus Companion** as a control-surface distribution channel via
  an upstream module PR; reuse its OBS-WebSocket v5 path for free.
- **Adopt BTCPay Server** as the bitcoin tipping backend (deployed alongside
  existing payment infra), framed as the "0% fee" tipping path.
- **Adopt VDO.Ninja** for guest streaming (self-host or embed).
- **Adopt LocalVocal + whisper.cpp** for live captioning ingest (caption track
  on the stream).
- **Adopt matrix-appservice-bridge** as the framework for any new bridge we
  build (e.g., custom Twitch chat bridge if needed).
- **Use discord.js + Eris + discord.py as our Discord-shim wire-compat test
  matrix**; PhantomBot/Mix It Up/Sery_Bot/Fossabot as our Twitch-IRC-shim
  compat matrix.
- **Evaluate PeerTube** as the federation layer for VOD + ActivityPub. Could
  be an embedded service or the inspiration for a Blackout-native ActivityPub
  implementation.
- **Build, don't adopt** for: Twitch.ext SDK shim (proprietary; we re-implement
  the surface from the public Rig), OBS-WebSocket v5 *server* (we are the
  server, not the client), Streamlabs/StreamElements alert socket protocol
  (documented spec, no OSS server impl).
- **Reconsider Build vs Adopt** for: full Discord shim. If Spacebar's gateway
  is too coupled to its persistence to fork cleanly, fall back to a fresh
  implementation guided by Spacebar's wire-shape tests.

### License posture

Blackout is licensed under AGPL-3.0. All adopted projects in this
list are MIT, Apache 2.0, or AGPL-3.0 — all compatible with our outbound
license. AGPL'd embeds (Spacebar) require us to publish the modified shim
source, which we already do. No commercial-license complications.

### Net effort impact

Original plan estimated ~1 year with a sizable team. With OSS adoption:
- Phase 1 (Twitch simulcast + ext shim): ~30% smaller — Twurple + MediaMTX cover most ingress/egress.
- Phase 2 (Discord + Patreon): ~50% smaller — Spacebar fork + patreon-api.ts.
- Phase 3 (TikTok/YT/Kick/OBS): ~40% smaller — TikTok-Live-Connector + kick-js + InnerTube port.

Net: roughly 2 quarters of engineering rather than 4 if Spacebar fork lands cleanly.

---

## 10. Verification

End-to-end test plan once implementation begins:
- **Track A simulcast**: Stream OBS → Blackout RTMP, verify fan-out to a
  Twitch test channel + YT test stream; confirm chat from both flows back
  into the Blackout den with origin badges; trigger a follow on Twitch and
  verify the Blackout alert widget fires.
- **Twitch ext shim**: Take an open-source Twitch extension (e.g., a public
  panel example), upload via the new `twitchExtensions.ts` flow, verify it
  renders in the panel slot under the player and that `Twitch.ext.onAuthorized`
  fires with a valid JWT containing the Blackout-derived `opaque_user_id`.
- **Discord bot shim**: Connect `discord.js` (unmodified) to the compat
  gateway with a Blackout-issued bot token, verify HELLO/IDENTIFY handshake,
  send a message in a mapped Matrix room, confirm `MESSAGE_CREATE` arrives
  at the bot, then have the bot `POST /channels/{id}/messages` and confirm
  it appears in Matrix.
- **OBS-WebSocket**: Connect Stream Deck (unmodified) to
  `ws://localhost:4455`, switch scenes, confirm Blackout's stream control
  reflects the change.
- **Streamlabs widget**: Paste an existing Streamlabs alert browser-source
  URL replacement (issued by Blackout) into OBS, trigger a Blackout tip,
  confirm the existing widget fires unchanged.
- **Compat-test harness**: Replay recorded Twitch + Discord traces against
  the shims weekly in CI; gate releases on zero regressions.
