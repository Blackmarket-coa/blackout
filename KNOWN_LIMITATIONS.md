# Known Limitations — Beta

This document is for open-source beta testers. It lists features that are
intentionally incomplete or scope-deferred for the beta milestone, so you
can avoid filing duplicate reports and know which gaps are already on the
roadmap.

For the closed-state launch-gap register see
[`docs/audits/production_readiness_2026_05.md`](docs/audits/production_readiness_2026_05.md).
For forward sequencing see
[`docs/architecture/deferred-bodies-schedule-2026-05-01.md`](docs/architecture/deferred-bodies-schedule-2026-05-01.md).
For the source-of-truth triage with tier/owner detail see
[`docs/audits/unfinished_items_review_2026_05.md`](docs/audits/unfinished_items_review_2026_05.md).

---

## Feature gaps (in-product)

### Livestream den chat overlay
- **Where:** `/live/:streamId` viewer
  (`apps/blackout-client/src/app/features/streams/LivestreamViewer.tsx`)
- **State:** Viewer, Owncast embed, TipButton, an "Open full den" deep-link
  CTA, and the embedded den chat all ship. A stream→den association is part
  of `StreamRecord.denId` and round-trips through
  `PUT /v1/streaming/streams/:streamId/metadata`. The embedded chat (the
  associated Matrix den mounted in-page below the player) is lazy-loaded via
  `EmbeddedDenChat` whenever the stream has a `denId`; the deep link remains
  as the "open full den" path. The Workstream D media-player polish (playback
  speed + volume controls) shipped 2026-07-12; any further overlay work rides
  with the Phase 5 LiveKit runtime binding.

### Playbook Q1 icons
- **Where:** Q1 ("How many of us are in this den?") in the playbook
  picker (`apps/blackout-client/src/app/features/playbook/picker/QuestionSize.tsx`)
- **State:** Renders without bespoke iconography.
- **Blocker:** Design delivery of solarpunk SVGs at
  `public/res/svg/playbook/q1-size-{trio|small|medium|constellation}.svg`.
  The component already accepts a `leadingIcon` prop, so this is a
  drop-in once assets land.

### Marketplace integrations
- **Real integration:** Freeblackmarket (FBM).
  - Production-ready when `FREEBLACKMARKET_API_KEY` and
    `FREEBLACKMARKET_WEBHOOK_SECRET` are set. Falls back to an in-memory
    stub when `FREEBLACKMARKET_STUB=1`.
  - Set `FREEBLACKMARKET_ENABLED=false` to opt out entirely.
- **Placeholder integrations:** Blamazon, MayhemMarketplaze, AntinAmazon
  (`packages/api/src/integrations/marketplace/{blamazon,mayhemMarketplaze,antinAmazon}.ts`).
  - These are wired as registered providers but return empty catalogs,
    throw on checkout, and reject webhook verification. They default to
    **disabled** via their `*_ENABLED` env vars; do not enable them in
    production until real adapters are implemented.

### Notification click-to-room routing
- The notification subsystem ships across web/mobile/desktop. The in-app
  routing handler (notification tap / deep link → room) is implemented in
  `NativeBridgeListener` and unit-tested
  (`apps/blackout-client/tests/unit/platform/NativeBridgeListener.test.tsx`);
  full end-to-end coverage on real Capacitor/Tauri builds is still pending.
- **Thread-level deep routing is now wired client-side.**
  `NotificationInteractedEvent` carries an optional `threadRootEventId`; the
  mobile push handler forwards `thread_root_event_id` when present;
  `NativeBridgeListener` routes to a `?thread=&event=` target; and
  `CommunitiesRoute` hydrates `activeThreadRootIdAtom` from `?thread=` so the
  thread panel opens on that root (mirrors the existing `?event=` jump). The
  remaining end-to-end gap is the **Sygnal push gateway emitting the thread id
  in the FCM/APNs payload** (homeserver-config); until then mobile taps still
  arrive with `room_id` only and fall back to room-level routing. Manual
  reports welcome.

---

## Deferred multi-week workstreams

These are tracked in
[`docs/architecture/deferred-bodies-schedule-2026-05-01.md`](docs/architecture/deferred-bodies-schedule-2026-05-01.md).
Workstreams A (Ports 1–5), C, D, and F are closed (stage channels and the
LiveKit runtime binding form Phase 5, whose deployment manifests now ship
in-repo); E is closed client-side with the Draupnir sidecar manifests also
in-repo (deployment is the remaining operator step); B's primitive set has
shipped (only incremental adoption remains).

| Workstream | Scope | Status |
| --- | --- | --- |
| **B** | `@blackout/ui` v1 primitives (Button/Input/Select/etc.) using `vanilla-extract`. | Primitive set shipped (B1 + B1.1). Incremental production adoption ongoing — 15 files consume the now-real `@blackout/ui/primitives` specifier (MessageComposer, MutualAidPage, coliseum tabs, ProposalCreator, RoleEditor). |
| **C** | Reactions / threading hardening: `ThreadPanel` slot mount in `panelSlots.tsx`, sidebar `ThreadUnreadBadge` mount, integration coverage. | **Closed (2026-06-13).** `ThreadPanel` wired into the `panelSlots.tsx` `threads` slot, `ThreadUnreadBadgeMount` in `CanopySidebar.tsx`, and the round-trip test landed (`apps/blackout-client/tests/unit/features/threading-parity/workstreamC.roundtrip.test.tsx`). |
| **D** | Discord parity P2: GIF picker (Giphy), voice/video polish, screen-sharing polish, media player controls. | **Closed (2026-07-12)** except the LiveKit runtime binding, carved to Phase 5 with stage channels. GIF picker shipped in full (Giphy provider + Tenor fallback + per-device recents). Voice messages round-trip: the composer sends `m.audio` + MSC3245 with real waveform/duration metadata (previously fell through as `m.file`), and the timeline player renders transmitted peaks. Pasted/dropped attachments now send with mimetype-inferred msgtypes (inline images/video/audio instead of generic files). Media players gained playback-speed (audio+video) and audio volume controls; screen sharing gained a local preview tile. |
| **E** | Discord parity P3: custom emoji packs, welcome flow, AutoMod, raid protection, verification gates, slowmode, audit log. | **Closed client-side (2026-07-11).** MSC2545 packs (incl. reactions-picker unification), welcome/onboarding, slowmode, verification/join gates (`co.bmc.verification_gate`: membership-period rule enforced in the composer, account-age rule carried for the server-side enforcer), AutoMod config editor, Draupnir console, mod-action audit log, and the Mjolnir REST backend all ship. Remaining: deploying the external Draupnir sidecar that enforces `co.bmc.automod` / raid lockdown / account-age server-side — its manifests now ship in `infra/single-server-baseline/` (Draupnir 3.1.0 service + config template + RUNBOOK §11.1 bootstrap), so what's left is the operator step. |
| **F** | Discord parity P4: theme engine (light/AMOLED), quick switcher, accessibility audit, profile-card polish, advanced notification controls. | **Closed (2026-07-11)** except stage channels, which are carved out to a Phase 5 alongside Workstream D's RTC baseline (see the schedule doc's F status update). |

---

## Operational

### Invite-only registration during the Test Flight
Signup at `matrix.theblackout.app` is gated by one-time tokens issued
by a maintainer (`m.login.registration_token`). Testers request a token
by opening an [Invite request issue](https://github.com/Blackmarket-coa/blackout/issues/new?template=invite-request.yml);
the homeserver-side mechanics are documented in
[`infra/single-server-baseline/synapse/ENABLE_REGISTRATION.md`](infra/single-server-baseline/synapse/ENABLE_REGISTRATION.md),
with `mint-invite-token.sh` next to it as the issuing helper.

### Release signoff
The CI release gate
(`tools/ci/check-blackout-client-release-gate.mjs`) requires a populated
`apps/blackout-client/docs/release/staging-signoff.report.json`. The
generator at `tools/ci/generate-staging-signoff.mjs`
(`pnpm release:generate-signoff`) emits the canonical shape from current
HEAD; the three `manualVerification.*` flags require human attestation
on real Tauri/Capacitor builds and are left `false` by default. Full
workflow in
[`docs/operations/runbooks/staging-signoff.md`](docs/operations/runbooks/staging-signoff.md).

### Phase 0 archive push
The historical Element-fork archive branch (`archive/element-web-fork`)
and tag (`v0-element-fork`) exist locally but have not been pushed to
`origin`. This is preservation-only and doesn't block any forward work
(see [`docs/archive/PHASE0_STATUS.md`](docs/archive/PHASE0_STATUS.md) note
for the supersession rationale). Pushing
requires a clone with write access — it can't be done from the CI
sandbox.

### CI build wrapper
`apps/blackout-server/.ci/scripts/auditwheel_wrapper.py:53` contains a
`HACK` comment about an older-pip wheel-tag workaround inherited from
upstream Synapse tooling. CI-only, not user-facing.

---

## Filing a report

If you hit something not in this list, please file an issue with:

- Platform (web / desktop / mobile + OS version)
- Den / room context (public or your own test den)
- Steps to reproduce
- Whether feature flags or env vars deviate from defaults

Reports about anything in this document are still welcome if you have
new repro detail — just reference the section so we can avoid dupes.
