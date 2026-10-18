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

-   **Where:** `/live/:streamId` viewer
    (`apps/blackout-client/src/app/features/streams/LivestreamViewer.tsx`)
-   **State:** Viewer, Owncast embed, TipButton, an "Open full den" deep-link
    CTA, and the embedded den chat all ship. A stream→den association is part
    of `StreamRecord.denId` and round-trips through
    `PUT /v1/streaming/streams/:streamId/metadata`. The embedded chat (the
    associated Matrix den mounted in-page below the player) is lazy-loaded via
    `EmbeddedDenChat` whenever the stream has a `denId`; the deep link remains
    as the "open full den" path. The Workstream D media-player polish (playback
    speed + volume controls) shipped 2026-07-12; any further overlay work rides
    with the Phase 5 LiveKit runtime binding.

### Playbook Q1 icons

-   **Where:** Q1 ("How many of us are in this den?") in the playbook
    picker (`apps/blackout-client/src/app/features/playbook/picker/QuestionSize.tsx`)
-   **State:** Renders without bespoke iconography.
-   **Blocker:** Design delivery of solarpunk SVGs at
    `public/res/svg/playbook/q1-size-{trio|small|medium|constellation}.svg`.
    The component already accepts a `leadingIcon` prop, so this is a
    drop-in once assets land.

### Marketplace integrations

-   **Real integration:** Freeblackmarket (FBM).
    -   Production-ready when `FREEBLACKMARKET_API_KEY` and
        `FREEBLACKMARKET_WEBHOOK_SECRET` are set. Falls back to an in-memory
        stub when `FREEBLACKMARKET_STUB=1`.
    -   Endpoint paths are built as `FREEBLACKMARKET_API_PREFIX` + resource,
        defaulting to `/v1/integrations/blackout/commerce` — FBM's integration
        surface, the only mount that works against a real FBM. The var exists
        as an override if FBM ever moves the mount; a path inside
        `FREEBLACKMARKET_BASE_URL` is discarded by URL resolution.
    -   Set `FREEBLACKMARKET_ENABLED=false` to opt out entirely.
    -   Settings -> Subscriptions "Manage billing on Free Black Market"
        (2026-10-06) depends on FBM's manage-session endpoint, which FBM is
        building in parallel. Until it is live and `FBM_MANAGE_SESSION_ENABLED`
        is set, `POST /v1/subscriptions/manage-session` answers 503 and the
        section (client flag `accountSubscriptions`, default off) says billing
        management is not available yet. Changes made on the FBM page reach
        Blackout by webhook, so the Blackout screen can lag behind them.
        Comped and gifted access is local to Blackout and is not shown on FBM.
        The button is hidden on iOS outside the US. On the Tauri desktop shell
        (2026-10-06) external purchase and billing links go to the system
        browser through `tauri-plugin-opener`, scoped to `https://*` in
        `blackout-desktop/src-tauri/capabilities/default.json`; if the plugin
        refuses, the client falls back to `window.open` and the screen still
        shows the link. That shell is compile-checked (`cargo check --locked`)
        but has not been exercised in a running desktop build.
-   **Desktop shell build:** until 2026-10-06 `blackout-desktop` did not
    compile on `develop` (an autostart argument type and the global-shortcut
    plugin's changed `register` API), unnoticed because
    `.github/workflows/blackout-desktop-tauri.yml` runs only for pull requests
    and pushes to `main`. Both are fixed; the desktop workflow still does not
    run on `develop` pull requests, so a desktop break can again land unseen
    until a release.
-   **Placeholder integrations:** Blamazon, MayhemMarketplaze, AntinAmazon
    (`packages/api/src/integrations/marketplace/{blamazon,mayhemMarketplaze,antinAmazon}.ts`).
    -   These are wired as registered providers but return empty catalogs,
        throw on checkout, and reject webhook verification. They default to
        **disabled** via their `*_ENABLED` env vars; do not enable them in
        production until real adapters are implemented.

### Notification click-to-room routing

-   The notification subsystem ships across web/mobile/desktop. The in-app
    routing handler (notification tap / deep link → room) is implemented in
    `NativeBridgeListener` and unit-tested
    (`apps/blackout-client/tests/unit/platform/NativeBridgeListener.test.tsx`);
    full end-to-end coverage on real Capacitor/Tauri builds is still pending.
-   **Thread-level deep routing is now wired client-side.**
    `NotificationInteractedEvent` carries an optional `threadRootEventId`; the
    mobile push handler forwards `thread_root_event_id` when present;
    `NativeBridgeListener` routes to a `?thread=&event=` target; and
    `CommunitiesRoute` hydrates `activeThreadRootIdAtom` from `?thread=` so the
    thread panel opens on that root (mirrors the existing `?event=` jump). The
    remaining end-to-end gap is the **Sygnal push gateway emitting the thread id
    in the FCM/APNs payload** (homeserver-config); until then mobile taps still
    arrive with `room_id` only and fall back to room-level routing. Manual
    reports welcome.

### New canopy and den defaults (2026-10-18)

-   **Where:** the one table in
    `apps/blackout-client/src/app/components/create-room/newRoomDefaults.ts`,
    asked by the New canopy form, the New den form, the playbook reveal,
    `createDenInCanopy` (voice, forum, stage, announcement and
    category-menu dens), categories and Coliseum discussion dens.
-   **State:** in the Blackout app a new canopy, a den with no canopy and a
    den inside a public canopy start **public and not end-to-end encrypted**;
    a den inside a canopy that is not public starts restricted to that canopy
    and encrypted; a public canopy is listed in the Blackout canopy directory
    and any other canopy only when "List in the Blackout directory" is turned
    on (off by default). The Black Mask chat panel starts everything private
    (or, inside a canopy, restricted to that canopy's members; dens
    encrypted). `VITE_BLACKOUT_NEW_ROOM_DEFAULT=private` at build time makes
    the app start private too. The access chooser is at the top of both forms
    and says what each choice means; the playbook reveal, which has no
    chooser, says in one sentence what it is about to plant.
-   **Not enforced anywhere but the client.** The homeserver accepts whatever
    join rule a client sends, and `POST /v1/discovery/index/canopies` accepts
    a listing for any canopy from any signed-in account without checking the
    canopy's join rule; a modified client can list a private canopy or make a
    public one. A listing toggle for an existing canopy (space settings), and
    re-listing or un-listing when a canopy's join rule changes later, are not
    built: a canopy created private and later made public stays unlisted
    until someone lists it, and one created public stays listed after being
    made private.
-   **The homeserver's encryption backstop keys on the preset, not on the
    join rule.** `encryption_enabled_by_default_for_room_type: invite` (both
    in-repo homeserver templates) makes Synapse add `m.room.encryption` to
    every room created with the `private_chat` preset, after whatever
    `initial_state` the client sent, and a request that names no preset is
    `private_chat`. So the client names `public_chat` for a Public canopy,
    den or category and `private_chat` for the rest
    (`createRoomPreset` in `components/create-room/utils.ts`); without that,
    a Public den would be encrypted on those homeservers while the chooser
    said it was not. `public_chat` also changes two things, both the standard
    shape of a Matrix room anyone can join: the room gets no
    `m.room.guest_access: can_join` event, and the power level needed to
    invite stays at the default 50 (`private_chat` sets it to 0), so an
    ordinary member of a Public canopy or den cannot send invites; the
    creator and moderators can. Rooms created before 2026-10-18 named no
    preset, so a Public den made then may carry a server-added encryption
    event; a canopy or category created `private_chat` gets one too (the
    client never asks for encryption on a space, but the backstop has no
    space exemption; harmless, nothing is ever sent in a space).
-   **An unlisted canopy loses canopy-scoped features.** The API gates voice
    rooms (`routes/voice.ts`) and app installs (`services/apps.ts`) on the
    directory entry (`hasCanopy`), so a private canopy created with the toggle
    off cannot have them until it is listed; the toggle says so.
-   **Dens made before 2026-10-18** by the voice/forum/stage/announcement
    controls, the category menu, the Discord import or the Coliseum were
    invite-only by homeserver preset, not restricted to their canopy as the
    invitations service's comments assumed; categories were invite-only too.
    They keep those rules, and those rules count for what is made inside
    them: a den made by those controls follows the most private space between
    it and the top of its canopy (`resolveCanopy` in
    `features/canopy/denKind.ts`), so a new den inside one of those older
    invite-only categories in a public canopy starts restricted to the
    category and the canopy, and encrypted, rather than public. Making the
    category public (its join rule) makes new dens in it public again. Invite
    redemption admits the redeemer to the den's immediate parent and then to
    the den, which works for restricted dens and is unchanged for invite-only
    ones.
-   **Playbook dens:** the "Hearth" playbook (no governance features) used to
    plant a private, plaintext den; it now follows the table like every other
    playbook (encrypted whenever the den is not public).

### Black Mask chat panel (`/embed`)

-   **Where:** `apps/blackout-client/src/app/features/black-mask-embed/`;
    spec and status in `docs/black-mask-chat-panel-and-account-link.md`.
-   **State:** built, not deployed. Shows canopies, text dens and DMs with
    unread indicators (on by default). Framing is off unless the operator sets
    `BLACK_MASK_FRAME_ANCESTORS` on the web client container.
-   **Not there yet:**
    -   creating a canopy or a den from the panel (the defaults it will use
        are private and, for dens, encrypted; see "New canopy and den
        defaults" above);
    -   push notifications;
    -   account linking (B4/B5);
    -   any check of external links (B6): links open in a new tab unchecked;
    -   single sign-on inside the panel (it would redirect the frame);
    -   voice, stage and forum dens (they open in a normal Blackout tab).
-   **Session length (B3) is off by default, behind three switches.** In a
    web client built with `VITE_BLACKOUT_PANEL_SESSION_LENGTHS` on, signing in
    to the panel asks how long the session lasts (1 hour, 1 day, 7 days, 30
    days or until you sign out; nothing preselected), and the panel gets a
    Sign out button. No build in this repository sets it, so today the panel
    signs in as before, with no choice and no Sign out button. The timed
    lengths are offered only when, in addition, the homeserver runs the
    `blackout_runtime` module with `session_lengths_enabled: true` **and** the
    API has `BLACKOUT_SESSION_LENGTHS=1` with its migration 100; no in-repo
    deployment sets either. With all three on, the servers end the session at
    the chosen time even if the panel is closed. Not ended with it: a Matrix
    OpenID token minted before the end (it lasts up to an hour, and
    lk-jwt-service trades it for LiveKit tokens), API tokens that a modified
    client got by exchanging its Matrix token before the length was set
    (nothing ties them to the session's end), and what the session did while
    valid. The panel's Sign out does not end an API refresh token that a
    modified client kept from the exchange: it keeps working after Sign out,
    up to the session end, or, for "Until I sign out", for as long as it is
    refreshed at least once every 30 days. Until the sweep deletes the device
    (60 seconds by default), an ended token is still accepted by Synapse's
    `/logout` and `/logout/all`, which signs out every device of the account.
    Local stores are deleted when the panel next runs, not while the browser
    is closed. Never offered under MAS (MSC3861).
    Details: `docs/black-mask-chat-panel-and-account-link.md` section 3.
-   **With that client switch on, the panel has its own session.** It never
    reuses a Blackout tab's session, so someone signed in to Blackout signs in
    again in the panel, as a separate device; older encrypted messages may not
    be readable there (BO-1). Signing out of Blackout in a tab does not sign
    the panel out; the panel's own Sign out button does. With the switch off
    (the default) the panel uses the full app's storage names, as before B3,
    so whether it shares a tab's session depends on the browser's storage
    partitioning for extension frames, which has not been checked.
-   **Only the `apps/blackout-client/Dockerfile` image implements the
    allow-list.** On that image nothing can be framed until
    `BLACK_MASK_FRAME_ANCESTORS` is set on its container (and the container
    recreated), with or without the front proxies. Since 2026-10-11 the
    `infra/nginx` and single-server-baseline proxies pass that image's panel
    policy through on `/embed` and keep blocking framing on every other HTTPS
    response from the web client's host; neither proxy change is deployed. Other images and
    hosts do not implement the allow-list, and some leave the panel open: the
    `blackout-web` image sends no framing header on `/embed` (nor on `/` and
    `/index.html`), so any site can frame those pages there, and Railway,
    Vercel and Netlify send no framing headers at all.
-   **Firefox:** extension origins are per-install, so a fixed allow-list
    cannot name the Firefox extension.
-   **Unverified:** the signed-in panel against a deployed homeserver, and the
    panel inside a real extension. Session lengths were run end to end only
    against a homeserver started locally from this repository, before the
    client switch existed. The homeserver's tests
    (`tests/blackout_runtime/test_session_length.py`) run only by hand: CI runs
    no `apps/blackout-server` tests, so a regression in
    `blackout_runtime/session_length.py` would merge green.
    Framing through the front proxies was checked with nginx (1.24.0 locally,
    1.27.5 and 1.22.1 in containers) and Chromium only, not on a deployed host
    or through Cloudflare.

### Dead-man's switch (experimental)

-   **Where:** the Deadman Switch panel at `/deadman`
    (`apps/blackout-client/src/app/features/deadman/`) and the API's
    `/v1/deadman` routes (`packages/api/src/modules/deadman.ts`). The panel
    is shown to every account by default (client flag `deadman`).
-   **State:** the app can show your switches but cannot arm one. Check-in
    and cancel from the app are refused for every account, because the
    session token never carries `deadman.write`. When a switch fires,
    Blackout does not notify anyone or post anything: the switch only changes
    status to `triggered`. Do not rely on it for your safety.
-   Recipients named by Blackout account id can read the encrypted payload
    through the API only after it fires. Giving them the key is up to you:
    the server never decrypts the payload and never delivers it. A recipient
    named by Matrix id or room id never matches anyone.
-   What a switch should release, and to whom, is an open product decision
    (N2 in
    [`docs/security/deadman-and-feeds-triage-2026-10-12.md`](docs/security/deadman-and-feeds-triage-2026-10-12.md)).

---

## Deferred multi-week workstreams

These are tracked in
[`docs/architecture/deferred-bodies-schedule-2026-05-01.md`](docs/architecture/deferred-bodies-schedule-2026-05-01.md).
Workstreams A (Ports 1–5), C, D, and F are closed (stage channels and the
LiveKit runtime binding form Phase 5, whose deployment manifests now ship
in-repo); E is closed client-side with the Draupnir sidecar manifests also
in-repo (deployment is the remaining operator step); B's primitive set has
shipped (only incremental adoption remains).

| Workstream | Scope                                                                                                                                     | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B**      | `@blackout/ui` v1 primitives (Button/Input/Select/etc.) using `vanilla-extract`.                                                          | Primitive set shipped (B1 + B1.1). Incremental production adoption ongoing — 15 files consume the now-real `@blackout/ui/primitives` specifier (MessageComposer, MutualAidPage, coliseum tabs, ProposalCreator, RoleEditor).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **C**      | Reactions / threading hardening: `ThreadPanel` slot mount in `panelSlots.tsx`, sidebar `ThreadUnreadBadge` mount, integration coverage.   | **Closed (2026-06-13).** `ThreadPanel` wired into the `panelSlots.tsx` `threads` slot, `ThreadUnreadBadgeMount` in `CanopySidebar.tsx`, and the round-trip test landed (`apps/blackout-client/tests/unit/features/threading-parity/workstreamC.roundtrip.test.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **D**      | Discord parity P2: GIF picker (Giphy), voice/video polish, screen-sharing polish, media player controls.                                  | **Closed (2026-07-12)** except the LiveKit runtime binding, carved to Phase 5 with stage channels. GIF picker shipped in full (Giphy provider + Tenor fallback + per-device recents). Voice messages round-trip: the composer sends `m.audio` + MSC3245 with real waveform/duration metadata (previously fell through as `m.file`), and the timeline player renders transmitted peaks. Pasted/dropped attachments now send with mimetype-inferred msgtypes (inline images/video/audio instead of generic files). Media players gained playback-speed (audio+video) and audio volume controls; screen sharing gained a local preview tile.                                                     |
| **E**      | Discord parity P3: custom emoji packs, welcome flow, AutoMod, raid protection, verification gates, slowmode, audit log.                   | **Closed client-side (2026-07-11).** MSC2545 packs (incl. reactions-picker unification), welcome/onboarding, slowmode, verification/join gates (`co.bmc.verification_gate`: membership-period rule enforced in the composer, account-age rule carried for the server-side enforcer), AutoMod config editor, Draupnir console, mod-action audit log, and the Mjolnir REST backend all ship. Remaining: deploying the external Draupnir sidecar that enforces `co.bmc.automod` / raid lockdown / account-age server-side — its manifests now ship in `infra/single-server-baseline/` (Draupnir 3.1.0 service + config template + RUNBOOK §11.1 bootstrap), so what's left is the operator step. |
| **F**      | Discord parity P4: theme engine (light/AMOLED), quick switcher, accessibility audit, profile-card polish, advanced notification controls. | **Closed (2026-07-11)** except stage channels, which are carved out to a Phase 5 alongside Workstream D's RTC baseline (see the schedule doc's F status update).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

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

-   Platform (web / desktop / mobile + OS version)
-   Den / room context (public or your own test den)
-   Steps to reproduce
-   Whether feature flags or env vars deviate from defaults

Reports about anything in this document are still welcome if you have
new repro detail — just reference the section so we can avoid dupes.
