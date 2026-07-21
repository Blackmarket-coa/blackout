# Blackout feature overview

A map of what is actually implemented in this repository, grouped by area, with
pointers to the code that backs each claim. This is the "what does Blackout
do?" document for new users and contributors; per-feature design docs live
alongside this file in `docs/features/`, and beta-specific gaps are tracked in
[`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md).

Feature maturity varies — everything listed here exists in code, but some
capabilities ship behind environment gates or are still being hardened for the
V1 Test Flight. When in doubt, check `KNOWN_LIMITATIONS.md` and the feature's
own tests.

## Glossary

Blackout renames some Matrix primitives in user-facing copy:

| Blackout term | Matrix equivalent                 |
| ------------- | --------------------------------- |
| **Canopy**    | Space / community                 |
| **Den**       | Room / channel                    |
| **Coalition** | Cross-canopy team or organization |

## Core communication

Client code: `apps/blackout-client/src/app/features/`; server code:
`packages/api/src/modules/` and `packages/api/src/routes/`.

-   **Messaging** — E2EE chat over Matrix with reactions, replies, threads
    (`room`, `auth-threads`, `threads.ts`), scheduled messages
    (`scheduledMessages.ts`), message/media search (`message-search`, `search`),
    GIF pickers (Giphy with Tenor fallback: `giphy.ts`, `tenor.ts`), voice
    messages, and rich media attachments.
-   **Voice & video** — 1:1 and group calls, screen share, and stage channels
    over a LiveKit SFU (`call`, `media-call`, `stage-channels`, `soundboard`;
    infra: `infra/single-server-baseline/` livekit + lk-jwt + coturn).
-   **Watch parties** — synchronized co-watching in a den via the
    `co.bmc.watch_party` state event: a host-driven shared player (drift
    reconciliation with hard-seek/rate-nudge), live-event co-watch, and
    screenshare mode over the call layer, plus floating reactions, a
    host-control request queue, and a "watching now" presence roster
    carried by timeline events (`watch-party`).
-   **Communities** — canopies (spaces) with dens, roles and granular
    permissions, pins, member panels, discovery/lobby/welcome flows, forums,
    topics, documents, and an education module (`canopy`, `communities`,
    `spaces`, `discovery`, `forum`, `topics`, `documents`, `education`,
    `roles`).
-   **Notifications & presence** — per-room notification rules, click-to-room
    routing across web/desktop/mobile, presence service
    (`notifications-presence`, `notifications.ts`).
-   **Federation** — standard Matrix federation plus self-host tooling, mesh
    transport settings, and federation ops surfaces (`federated-ops`,
    `federation-selfhost`, `mesh`, `federation.ts`).

## Safety, privacy, and OPSEC

These are Blackout's most distinctive capabilities, aimed at communities with
real adversaries.

-   **Steganography** — hide/reveal messages inside images, with a full client
    toolkit and lifecycle tooling (`steganography`, `stego-toolkit`; server
    `modules/stego`).
-   **Deaddrop** — hidden ephemeral messaging via a dedicated Matrix appservice
    with opaque envelopes and decoy traffic (`deaddrop`,
    `apps/deaddrop-appservice/`).
-   **Panic button & active defense** — one-action lockdown plus configurable
    active-defense settings (`panic`, `activedefense.ts`).
-   **Burner identities** — disposable identities with a burner-mode indicator
    (`burner-identity`, `identities.ts`).
-   **Dead-man's switch** — timed check-in with configurable consequences
    (`deadman`, `modules/deadman`).
-   **Canary tripwire & transparency** — warrant-canary tripwires, key
    transparency, and data-transparency surfaces (`canaryTripwire.ts`,
    `keyTransparency.ts`, `transparency.ts`, `data-transparency`).
-   **Encrypted vault** — client-side-encrypted storage (`vault`, `vault.ts`).
-   **Metadata privacy** — outbound metadata scrubbing, ephemeral view
    policies, and data deletion controls (`metadata-privacy`, `ephemeral`,
    `data-deletion`, `privacy-tools`; infra `perturbation` service).
-   **Cryptography** — Matrix E2EE plus post-quantum hybrid encryption
    (X25519 + ML-KEM-768) and WebAuthn support (`webauthn.ts`); threat analysis
    in [`THREAT_MODEL.md`](../../THREAT_MODEL.md).

## Governance & coalition

-   **Governance** — proposals, voting and tally, delegation, sortition, tasks,
    and a bounty ledger (`governance`, `modules/governance`, `bounties.ts`;
    analysis: [`governance_features_analysis.md`](governance_features_analysis.md)).
-   **Coalitions** — cross-canopy team/organization views with chat, events,
    proximity map (PostGIS + martin tiles in the infra baseline), and coalition
    kits (`coalition`, `coalition.ts`, `coalitionKitManifests.ts`).
-   **Mutual aid** — aid boards and pooled funds (`aidPools.ts`; mutual-aid
    feed surfaces in the client).
-   **Moderation** — role-based moderation, verification/join gates, AutoMod
    and raid-protection style controls, audit surfaces, and Draupnir/Mjolnir
    integration (`moderation`, `modules/moderationMjolnir`; infra `draupnir`
    sidecar).
-   **Reputation & character sheets** — reputation tracking and shareable,
    view-gated character sheets (`reputation.ts`, `character-sheet`).
-   **Coliseum** — structured public debate: topics, stances, argument reels,
    challenges, rankings, and arenas (`coliseum`, `coliseum.ts`;
    [`docs/coliseum/`](../coliseum/README.md)).

## Creator economy & streaming

-   **Live streaming** — go-live streaming with VOD recording, clip creation
    (client-side ffmpeg cut + optional captions), and a creator hub with
    insights (`streaming`, `streams`, `creators`, `modules/streaming`,
    `vodRecorderWorker`, `clipCutterWorker`).
-   **Video creation** — TikTok-style hold-to-record over the native camera
    viewfinder on mobile (`@capgo/camera-preview`, multi-take stitching), an
    in-app webcam recorder on desktop, color-filter grades, and on-device
    trim/crop/compress — hardware-accelerated via WebCodecs (mediabunny) with
    ffmpeg.wasm fallback — posting to the Coalition map's reel. The
    full-quality original stays in an on-device vault (only a bounded
    720p/1280p rendition uploads), so server copies can expire under media
    retention — the reel then offers the creator one-tap repost from the
    device (`coalition/composer/VideoComposer`, `NativeCameraRecorder`,
    `useWebcamRecorder`, `streaming/composer/renditionPipeline`,
    `platform/localVideoVault`, `platform/nativeMediaBridge`).
-   **Monetization** — tips, gifts, subscriptions, channel points, community
    boosts, ad-revenue accounting, revenue split contracts, entitlements, and a
    Patreon webhook bridge (`monetization`, `tips.ts`, `gifts.ts`,
    `subscriptions.ts`, `channelPoints.ts`, `communityBoosts.ts`,
    `adRevenue.ts`, `splitContracts.ts`, `entitlements.ts`,
    `patreonWebhook.ts`).
-   **Broadcast tooling** — RTMP fanout and simulcast to external destinations,
    OBS WebSocket integration (including a Bitfocus Companion module at
    `packages/companion-blackout/`), Streamlabs integration, and stream widget
    alerts (`rtmpFanout.ts`, `simulcastDestinations.ts`, `obsWsPasswords.ts`,
    `streamlabs.ts`, `widgetAlerts.ts`).
-   **Marketplace** — marketplace surfaces with provider integrations
    (`market`, `marketplace`, `marketplace.ts`; provider status in
    [`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md)).
-   **Growth** — referrals, ambassador programs, quests, objectives,
    time-bounded rounds, and reusable playbooks (`growth`, `quests`,
    `objectives`, `rounds`, `playbook`, `modules/growth`).

## Platform bridges & integrations

First-party bridge routes in `packages/api/src/routes/`:

-   **Twitch** — chat bridge, EventSub, Helix proxy, extensions, IRC bot tokens.
-   **YouTube & Kick** — live chat bridges.
-   **Discord** — compatibility webhooks, bridge activations, and server
    import (`discordServerImport.ts`, plus a client `migration-hub` for
    moving communities in).
-   **Generic Matrix bridges** — Hookshot webhooks and the
    matrix-appservice/Mautrix family for IRC/Slack/etc. (see the "Minimum
    viable bridges" section of the root [`README.md`](../../README.md)).
-   **Outbound event webhooks** and linked external accounts
    (`outboundEventWebhooks.ts`, `linkedAccounts.ts`).

## Platform & extensibility

-   **Plugin ecosystem** — sandboxed-iframe code plugins with an authoring SDK
    (`packages/plugins-sdk/`), plugin discovery/installation/social routes, and
    capability-manifest permissions (design: `privacy-first-phase6/`).
-   **AiDen** — per-den AI assistant panel with pluggable providers (`aiden`).
-   **Apps & surfaces** — web client (`apps/blackout-client`), Tauri desktop
    (`blackout-desktop/`), Capacitor mobile (`blackout-mobile/`), governance
    surface (`apps/blackout-gov`), Synapse-derived homeserver
    (`apps/blackout-server`), Hono API (`packages/api`).
-   **Migration & lifecycle** — migration hub and dashboard for importing
    communities, "compost" archive-with-dignity for retiring dens
    (`migration-hub`, `migrationDashboard.ts`, `compost`).
-   **Analytics & telemetry** — opt-in, env-gated event telemetry with a
    ClickHouse + Cube + Metabase warehouse in the production baseline
    (`telemetry.ts`, `services/analyticsEvents.ts`,
    `infra/single-server-baseline/`).
-   **Operations** — admin, diagnostics, integrations health, bug-report and
    widget-report intake (`admin.ts`, `diagnostics.ts`,
    `integrationsHealth.ts`, `bugReport.ts`, `bug-widget`).

## Where to go deeper

-   Design blueprints and per-feature specs: this directory
    ([`docs/features/README.md`](README.md)).
-   Current beta gaps: [`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md).
-   Security posture: [`THREAT_MODEL.md`](../../THREAT_MODEL.md) and
    [`SECURITY.md`](../../SECURITY.md).
-   Deployment: [`infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md).
