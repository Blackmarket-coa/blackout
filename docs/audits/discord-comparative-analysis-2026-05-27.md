# Blackout vs. Discord — Comparative Analysis (2026-05-27)

## 1. Context & methodology

Blackout is a Matrix-based, end-to-end-encrypted communication platform (TypeScript/JS monorepo
client on `matrix-js-sdk`, Synapse-derived homeserver, Hono API). It is frequently compared to
Discord because it targets the same "community + real-time chat + voice" use case.

This document compares Blackout to Discord and, critically, **reconciles the repo's existing
Discord-parity planning docs against what is actually implemented in the codebase.** Those docs
(`DISCORD_PARITY_BUILD_PLAN.md`, `docs/features/discord_parity_blueprint.md`,
`docs/discord_like_onboarding_execution_plan.md`) were written as forward-looking roadmaps and
were never reconciled against shipped code. As a result they materially **under-report** current
capability (voice/video, forum channels, roles, moderation, onboarding are all shipped but listed
as "Partial / Needs Build / Custom").

**Method:** every status claim below was verified by reading the implementing source file. Status
vocabulary is grounded in code, not roadmap intent:

- **Implemented** — working feature code exists and is wired into the app.
- **Partial** — core works but a notable sub-capability is missing.
- **Stubbed** — entry point / feature flag exists, no working implementation.
- **Absent** — not present.
- **3rd-Party** — delegated to an external service.

---

## 2. Head-to-head: Blackout vs Discord

### Core text chat
At parity. Blackout has rooms (channels), spaces (servers), threads, replies, edits, reactions,
pins, full-text search, and attachments — all on native Matrix primitives
(`apps/blackout-client/src/app/features/room/`, `.../message-search/`). Markdown, spoilers, and
@mentions are supported. Discord's edge here is purely cosmetic (animated/custom emoji UX, GIF
picker via Tenor — a 3rd-party concern in both products).

### Voice & video
At parity, and stronger than the docs imply. Persistent voice channels
(`features/call/VoiceChannel.tsx`), multi-party calls + audio levels + mute/deafen
(`features/call/CallProvider.tsx`) over MatrixRTC (MSC3401) + LiveKit, screen share
(`features/call/CallControls.tsx`), and Go-Live/RTMP streaming (`features/streaming/`).
**Gap vs Discord:** no push-to-talk; stage channels and soundboard are stubbed (see §6).

### Roles, permissions & moderation
At parity. Named-role system mapped onto Matrix power levels (`features/roles/RoleEditor.tsx`,
`useRoles.ts`), per-user/per-role permission editing, kick/ban (native Matrix), timeout
(`features/moderation/TimeoutDialog.tsx`), and AutoMod keyword/regex filtering with auto-redaction
via Draupnir/Mjolnir (`features/moderation/KeywordFilterEditor.tsx`, `AutoModPanel.tsx`,
`draupnir/`). **Gap:** audit log is basic (`ModActionLog.tsx`) vs Discord's rich audit log.

### Presence & status
Behind Discord. Typing indicators (`features/room/RoomViewTyping.tsx`) and an activity/presence
digest exist, but there is **no custom status message and no Discord-style rich presence
("Playing …")**. This is the weakest category relative to Discord.

### Notifications
At parity. Push delivery + a granular rules engine (`features/notifications/`,
`NotificationRulesEditor.tsx`), mention and role-mention handling, per-channel mute/DND.

### Onboarding & invites
At parity. Multi-use invite links (`features/invitations/invitationsClient.ts`), public
room/space discovery (`features/discovery/`), and a multi-step member onboarding flow
(`features/onboarding/OnboardingFlow.tsx`).

### Bots, integrations & webhooks
Mixed. **Discord-compatible incoming webhooks are implemented and tested** (see §4) — existing
Discord-webhook tooling (GitHub, Sentry, Grafana, IFTTT, Zapier) works by swapping the URL. Discord
OAuth account linking is implemented. A mautrix-discord bridge is documented and operable.
**Gap:** no generic in-app bot framework (Blackout relies on Synapse appservices instead).

### Newer Discord features
- **Forum channels** — Implemented (`features/forum/ForumView.tsx`, `useForum.ts`).
- **Stage channels** — Stubbed (quick-action entrypoint only).
- **Soundboard** — Stubbed (feature-flag/widget only).
- **Activities / embedded games** — Absent.

### Blackout differentiators (no Discord equivalent)
E2EE-by-default (Megolm + post-quantum hybrid), federation/interop via Matrix, governance &
coalition primitives (`packages/core/src/coalition/`, `features/governance/`), coliseum challenges,
steganography (`packages/core/src/steganography/`), and deaddrop dead-man's-switch delivery
(`features/deaddrop/`).

---

## 3. Verified parity matrix

| Discord feature | Blackout status | Evidence (file) |
|---|---|---|
| Text channels / DMs / group DMs | Implemented | `features/room/` |
| Threads | Implemented | `features/room/` (m.thread / MSC3440) |
| Replies | Implemented | `app/hooks/useTimeline.ts` (m.in_reply_to) |
| Message edit/delete | Implemented | `features/room/message/MessageEditor.tsx` |
| Reactions | Implemented | `features/room/Reactions.tsx` |
| Pins | Implemented | `features/room/room-pin-menu/RoomPinMenu.tsx` |
| Message search | Implemented | `features/message-search/` |
| Attachments / voice messages | Implemented | `features/room/attachments/`, `features/media-call/MediaUploadWidget.tsx` |
| Custom / animated emoji UX | Partial | emoji picker present; custom-emoji UX limited |
| GIF picker | 3rd-Party | Tenor/Giphy (external) |
| Voice channels | Implemented | `features/call/VoiceChannel.tsx` |
| Group voice/video calls | Implemented | `features/call/CallProvider.tsx` (MatrixRTC + LiveKit) |
| Screen share | Implemented | `features/call/CallControls.tsx` |
| Go Live / streaming | Implemented | `features/streaming/` |
| Push-to-talk | Absent | — |
| Roles & permissions | Implemented | `features/roles/RoleEditor.tsx`, `useRoles.ts` |
| Kick / ban | Implemented | native Matrix (`mx.kick` / `mx.ban`) |
| Timeout / mute | Implemented | `features/moderation/TimeoutDialog.tsx` |
| AutoMod (keyword/regex) | Implemented | `features/moderation/KeywordFilterEditor.tsx`, `draupnir/` |
| Audit log | Partial | `features/moderation/ModActionLog.tsx` |
| Online/idle presence | Partial | activity digest only; no full presence |
| Typing indicators | Implemented | `features/room/RoomViewTyping.tsx` |
| Custom status / rich presence | Absent | — |
| Push notifications + rules | Implemented | `features/notifications/NotificationRulesEditor.tsx` |
| Invite links | Implemented | `features/invitations/invitationsClient.ts` |
| Server/space discovery | Implemented | `features/discovery/` |
| Member onboarding | Implemented | `features/onboarding/OnboardingFlow.tsx` |
| Discord-compatible webhooks | Implemented | `packages/api/src/routes/discordCompatWebhooks.ts` |
| Discord OAuth linking | Implemented | `packages/api/src/integrations/discord/oauth.ts` |
| Discord bridge (mautrix) | Implemented (ops) | `deploy/.../mautrix-discord/RUNBOOK.md` |
| Generic in-app bot framework | Absent | appservices used instead |
| Forum channels | Implemented | `features/forum/ForumView.tsx` |
| Stage channels | Stubbed | quick-action entrypoint only |
| Soundboard | Stubbed | feature-flag/widget only |
| Activities / embedded games | Absent | — |

---

## 4. Code-level integration review

### Discord-compatible incoming webhooks — Implemented & tested
- **Service:** `packages/api/src/services/discordCompatWebhooks.ts`. Exposes Discord's URL shape
  `POST /api/webhooks/{id}/{token}`. Tokens are 24-byte base64url, stored only as a SHA-256 hash,
  authenticated with a constant-time compare. Inbound payloads are projected onto a single Matrix
  `m.room.message` tagged `m.blackout.origin = 'discord_compat_webhook'`. Blackout never calls
  Discord — wire-shape compatibility is the entire value.
- **Routes:** `packages/api/src/routes/discordCompatWebhooks.ts`. Authed CRUD at
  `/v1/integrations/discord-compat/webhooks` (token returned once on create); public execute at
  `/discord-compat/webhooks/:id/:token` returning 204/404/410/400. `?wait=true` is intentionally
  ignored (always 204, no message object returned).
- **Supported payload fields:** `content`, `embeds[]` (author, title, url, description, fields,
  footer), `username`, `avatar_url`.
- **Accepted but dropped:** `tts`, `allowed_mentions`, `components`, `files` (silently, so senders
  don't error).
- **Minor gap:** embed `color` and `timestamp` are parsed into the type but **not rendered** by
  `renderEmbedAsText()` (`discordCompatWebhooks.ts:158`). Low-effort enhancement.
- **Schema:** `packages/api/src/db/migrations/016_discord_compat_webhooks.up.sql` (hash-only token,
  `is_active`, `delivery_count`, `last_used_at`).
- **Tests:** `packages/api/test/discord-compat-webhooks.integration.test.ts` (validation, auth,
  inactive/empty rejection, embed rendering, cross-user delete, delivery accounting).

### Discord OAuth account linking — Implemented & tested
- `packages/api/src/integrations/discord/oauth.ts`: authorization-code flow with PKCE (S256),
  default scopes `identify,email`, `prompt=consent` on relink, legacy-discriminator fallback
  (`global_name` → `username`). Tokens stored as encrypted linked accounts; Blackout does not act on
  the user's behalf against Discord beyond opted-in integrations.
- **Tests:** `packages/api/test/oauth-providers.integration.test.ts` (PKCE, identity parsing,
  cross-provider state isolation, missing-config handling).

### mautrix-discord bridge — Operable (runbook)
- `deploy/docker/blackout-backend/integrations/mautrix-discord/RUNBOOK.md`: docker-compose profile,
  appservice registration into Synapse, credential rotation, health checks, backup policy. Provides
  message relay and bridge link/login commands. No code in this repo (standard mautrix image).

---

## 5. Doc reconciliation findings

The existing parity docs are stale and under-report shipped capability. Corrections:

| Existing doc claim | Doc's status | Verified reality | Corrected status |
|---|---|---|---|
| Group voice/video + screen share | Partial | LiveKit + MatrixRTC shipped | Implemented |
| Go Live / streaming | Partial/Custom | `features/streaming/` shipped | Implemented |
| Forum channels | Partial/Custom | `features/forum/` shipped | Implemented |
| Roles & permissions | Native + Custom (UI pending) | Role editor + power-level mapping shipped | Implemented |
| Timeout / AutoMod / slowmode | Custom (to build) | Timeout + Draupnir AutoMod shipped | Implemented (slowmode still TBD) |
| Member onboarding / discovery | Custom (to build) | Onboarding flow + discovery shipped | Implemented |
| Onboarding execution plan | Aspirational (assumes nothing exists) | Onboarding primitives exist | Partly delivered |
| Stage channels, soundboard | Custom (to build) | Entry points only | Stubbed (accurate-ish) |

The docs remain valuable as **roadmap rationale and architectural intent**; they are just no longer
an accurate status report. Each has been annotated with a dated pointer to this analysis.

---

## 6. Gap list & recommendations

Prioritized by user-visible impact vs. effort:

1. **Custom status / rich presence** (Absent) — largest perceived gap vs Discord. Medium effort
   (Matrix presence + a `co.bmc.*` status event).
2. **Push-to-talk** (Absent) — common voice expectation; small/medium effort in the call client.
3. **Stage channels** (Stubbed) — finish the broadcast-voice + restricted-speak implementation
   behind the existing entrypoint.
4. **Soundboard** (Stubbed) — implement behind the existing widget flag, or de-scope explicitly.
5. **Embed `color`/`timestamp` rendering** in `renderEmbedAsText()` — low-effort polish for
   webhook fidelity.
6. **Audit log depth** (Partial) — enrich `ModActionLog.tsx` toward Discord-level coverage.
7. **Generic bot framework** (Absent) — decide explicitly: keep the appservice model or add an
   in-app bot surface. Document the stance either way.
8. **Slowmode** — small per-room rate-limit feature to round out moderation parity.

**Bottom line:** Blackout is at roughly **75–80% Discord feature parity by working code** — higher
than its own docs claim — with clear strength in security/federation/governance and a focused gap
list dominated by presence/status and a couple of stubbed voice features.
