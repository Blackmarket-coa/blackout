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
- **State:** Viewer, Owncast embed, and TipButton work. Matrix den chat
  overlay + product shelf are deferred.
- **Blocker:** Server schema. `StreamRecord` needs a stream→den
  association before the client can wire the overlay; a migration under
  `packages/api/src/db/migrations/` is required.
- **Workaround:** Use the den's regular chat room out-of-band during a
  livestream.

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

### Desktop deep links
- **Mobile:** Capacitor wrapper handles both `matrix://` and `blackout://`.
- **Desktop:** Tauri wrapper handles `matrix://` only. `blackout://`
  deep links must be opened in the web app for now.

### Notification click-to-room routing
- The notification subsystem ships across web/mobile/desktop, but
  end-to-end routing (notification tap → land on the right room/thread)
  has no harnessed test coverage on Capacitor or Tauri yet. Manual
  reports welcome.

---

## Deferred multi-week workstreams

These are tracked in
[`docs/architecture/deferred-bodies-schedule-2026-05-01.md`](docs/architecture/deferred-bodies-schedule-2026-05-01.md).
Workstream A (Ports 1–5) is closed; B–F remain post-beta scope.

| Workstream | Scope | Status |
| --- | --- | --- |
| **B** | `@blackout/ui` v1 primitives (Button/Input/Select/etc., ~18 components) using `vanilla-extract`. | Scoped, not started. |
| **C** | Reactions / threading hardening: `ThreadPanel` slot mount in `panelSlots.tsx`, sidebar `ThreadUnreadBadge` mount, integration coverage. Helpers and components landed; final wiring pending. | ~60% complete. |
| **D** | Discord parity P2: GIF picker (Giphy), voice/video polish, screen-sharing polish, media player controls. | Scoped, not started. |
| **E** | Discord parity P3: AutoMod via Draupnir sidecar, raid protection, verification gates, slowmode. | Scoped, not started. |
| **F** | Discord parity P4: theme engine (light/AMOLED), stage channels, accessibility audit, profile-card polish. Recent-messages quick-switcher source landed. | Partial. |

---

## Operational

### Phase 0 archive push
The historical Element-fork archive branch (`archive/element-web-fork`)
and tag (`v0-element-fork`) exist locally but have not been pushed to
`origin`. This is preservation-only and doesn't block any forward work
(see `PHASE0_STATUS.md` note for the supersession rationale). Pushing
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
