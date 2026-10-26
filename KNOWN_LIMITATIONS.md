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
    -   **Webhook replay window (2026-10-25):** FBM signs its deliveries over
        the body alone, so a captured delivery verifies forever and only the
        event-id de-dupe (which now acknowledges a processed event before any
        handler runs, for every event family) stands between it and a replay.
        Blackout accepts a timestamped form (`x-fbm-timestamp`, signature over
        `<timestamp>.<body>`, 300-second window) and will refuse the body-only
        form once the operator sets `FREEBLACKMARKET_WEBHOOK_REQUIRE_TIMESTAMP=1`
        — which needs FBM to send the header first
        (`docs/contracts/freeblackmarket-integration-work-order.md` §1).
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
    category-menu dens), categories and Coliseum discussion dens. The Black
    Mask chat panel's New screens (2026-10-23) use the same two forms.
-   **State:** in the Blackout app a new canopy, a den with no canopy and a
    den inside a public canopy start **public and not end-to-end encrypted**;
    a den inside a canopy that is not public starts restricted to that canopy
    and encrypted; a public canopy is listed in the Blackout canopy directory
    and any other canopy only when "List in the Blackout directory" is turned
    on (off by default). The Black Mask chat panel starts a canopy private
    wherever it is made, inside another canopy too, and a den private or,
    inside a canopy, restricted to that canopy's members, and encrypted.
    `VITE_BLACKOUT_NEW_ROOM_DEFAULT=private` at build time makes the app
    start private too. The access chooser is at the top of both forms
    and says what each choice means; the playbook reveal, which has no
    chooser, says in one sentence what it is about to plant.
-   **Not enforced anywhere but the client.** The homeserver accepts whatever
    join rule a client sends, and `POST /v1/discovery/index/canopies` accepts
    a listing from any admin of the canopy (the power level needed to change
    its power levels, read from the homeserver) without checking the canopy's
    join rule; a modified client can list a private canopy its account
    administers, or make a public one. If the API cannot check the canopy on
    the homeserver, the listing is refused and the app says the canopy was
    created but not listed. A listing toggle for an existing canopy (space
    settings), and re-listing or un-listing when a canopy's join rule changes
    later, are not built: a canopy created private and later made public stays
    unlisted until one of its admins lists it, and one created public stays
    listed after being made private.
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
-   **The panel makes rooms it cannot invite to.** The panel has New canopy
    and New den screens but no invite screen, so people join a private
    canopy or den made there by invitation, sent from Blackout; the screens
    say so. The panel offers a den or canopy inside a canopy only when the
    canopy's power levels let the signed-in user add rooms to it, the rule
    the homeserver enforces; that check is the client's reading of the
    room's state, and the homeserver's refusal remains the backstop.
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
    unread indicators (on by default), and creates canopies and dens
    (`EmbedNew.tsx`, shipped 2026-10-24 in PR #965) with the defaults in "New
    canopy and den defaults" above. Framing is off unless the operator sets
    `BLACK_MASK_FRAME_ANCESTORS` on the web client container.
-   **Not there yet:**
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

### Scheduled messages

-   **Where:** the composer's "Scheduled send preset"
    (`apps/blackout-client/src/app/features/room/MessageComposer.tsx`) and
    `POST /v1/scheduled-messages` (`packages/api/src/routes/scheduledMessages.ts`).
-   **State:** A scheduled message is sent later by the Blackout bot, which
    cannot encrypt. The API stores the text as plaintext until it is sent, then
    clears it. Scheduling is refused in encrypted rooms, in rooms you are not in
    or may not post in, and in rooms the bot is not in; the bot checks the same
    things again right before sending (`packages/api/src/services/botPostingGate.ts`).
    Most private dens are encrypted, and the bot joins canopies rather than
    dens, so scheduling is not available in most dens.
-   **Not there yet:** you cannot see or cancel a scheduled message in the app.
    A message that cannot be delivered is dropped after 5 attempts without
    notice, and one refused at send time (you left the room, or it became
    encrypted) is dropped without notice too. A message the server reaches
    more than 15 minutes (by default) after its time, after an outage for
    example, is not sent late: it ends as failed (`expired_overdue`) with its
    text cleared, also without notice, and only your data export shows it.
    Messages are sent by the one server process that runs the API's
    background loops (in `deploy/docker/production`, the `worker` service);
    while none runs, nothing is sent.

### Deleting your account

-   **Where:** Settings → Privacy & data → Delete your account
    (`apps/blackout-client/src/app/features/settings/DataRetentionSection.tsx`);
    `POST /v1/auth/account/delete/request` and `/confirm`.
-   **State:** Deleting your Blackout account removes the account, its sessions
    and linked services, and cancels and erases your unsent scheduled messages.
    It does not yet deactivate your Matrix account, and your messages stay in
    rooms.

### Dead-man's switch (experimental)

-   **Where:** the Deadman Switch panel at `/deadman`
    (`apps/blackout-client/src/app/features/deadman/`) and the API's
    `/v1/deadman` routes (`packages/api/src/modules/deadman.ts`). The panel
    is shown to every account by default (client flag `deadman`).
-   **State (2026-10-26):** you can check in and cancel the switches you
    have, from the app or the API. You cannot arm a new one: the API refuses
    every arm (409 `arming_unavailable`) until Blackout can release a message
    to the people you name, which
    [`docs/security/deadman-release-design-2026-10-24.md`](docs/security/deadman-release-design-2026-10-24.md)
    plans. When an existing switch fires, Blackout does not notify anyone or
    post anything: the switch only changes status to `triggered`. Do not rely
    on it for your safety.
-   The switches that exist were armed through the API before this. Their
    payload is whatever was sent: the server never decrypts it and cannot
    tell whether it is ciphertext. Recipients named by Blackout account id
    can read it through the API only after the switch fires; until then a
    recipient is answered exactly like anyone else and learns nothing about
    the switch. Giving recipients a key is up to you. A recipient named by
    Matrix id or room id never matches anyone.
-   Cancelling a switch removes its payload from Blackout's database; the
    switch stays in your list as cancelled. A switch cancelled before cancel
    began removing payloads still holds its payload until you cancel it again
    ("Remove message" in the panel). Deleting your account cancels your switches that
    have not fired and removes their payloads and labels; a switch that has
    already fired keeps its payload for the people it named, because a
    release is not taken back. Where the deployment keeps database backups,
    they hold a removed payload until they expire.
-   If the server reaches your switch more than 15 minutes (by default) after
    it was due, because its background loops were down, it does not fire the
    switch then: the switch goes to grace with at least 72 hours left from
    that moment, once per missed check-in, and a check-in ends that as usual.
    So an outage can delay a release by its own length plus up to 72 hours.
    The grace and triggered events the sweep records stay in the memory of
    the process that ran it, so where that is a separate worker
    (`deploy/docker/production`) the event feed does not list them; the
    switch's status and release time do show them.
-   What a switch will release, and to whom, was decided on 2026-10-24 (N2 in
    [`docs/security/deadman-and-feeds-triage-2026-10-12.md`](docs/security/deadman-and-feeds-triage-2026-10-12.md)):
    the design above. Until it ships, nothing is released and arming stays
    closed.

### Admin-only API writes (2026-10-23)

-   **Where:** the API's write routes under `/v1/governance`,
    `/v1/moderation` (including `/v1/moderation/mjolnir`), `/v1/forum`,
    `/v1/channels`, `/v1/growth` and `/v1/deaddrop`, the channel list, and the
    discovery index other than canopy listing.
-   **State:** only accounts on the operator's admin allowlist
    (`BLACKOUT_ADMIN_USERS`) can use them. Each scope behind them covers a
    route that changes shared state with no ownership or role check: the API
    has no community membership or role model yet, so it cannot tell a
    community's members or moderators from anyone else, and a dead drop can be
    addressed to any account. Every other account gets 403. Before 2026-10-23
    any signed-in account could use them by naming the scope in the
    `x-blackout-capabilities` request header; that header can now only narrow
    what the session token carries.
-   **In the apps:** the Expo governance tab
    (`packages/mobile/app/(tabs)/governance.tsx`) still lists proposals and
    shows their tallies, but creating a proposal and voting are refused for an
    account that is not on the allowlist. In the web app, scheduling or
    cancelling a governance meeting, publishing a treasury snapshot or setting
    a milestone, the Mjolnir ban-list and protection settings, and the growth
    actions (referrals, ambassador applications, quests, migration credits)
    were refused for every account before and still are for anyone not on the
    allowlist.
-   **Next:** a role model built from Matrix power levels
    ([`docs/security/capability-header-triage-2026-10-23.md`](docs/security/capability-header-triage-2026-10-23.md)).

### Voice rooms in the API (2026-10-25)

-   **Where:** the API's voice rooms under `/v1/voice`
    (`packages/api/src/routes/voice.ts`). Calls in the apps do not use them:
    they go through MatrixRTC and lk-jwt-service. The web app reads only the
    list of open rooms.
-   **Roles come from the homeserver.** A canopy's admins (who can change its
    power levels) and moderators (at its kick level, 50 unless its admins
    changed it) can create a voice room in a listed canopy (with the premium
    subscription), lock and unlock it, mute, unmute, remove and readmit people,
    and enter it while it is locked. Everyone else is a member. A role named in
    a request counts for nothing; before 2026-10-24 any signed-in account could
    claim to be an admin. Mute, remove and readmit also need the moderator's
    level above the target's, as a kick on the homeserver does: a moderator
    cannot act on anyone at or above their own level, such as the canopy's
    admin, a moderator at the same level, or themselves.
-   **The canopy decides who may enter.** An account the canopy banned is
    refused, whatever level it kept. Its members and the invited get in. Anyone
    else gets into an unlocked room only where the canopy is public; under any
    other join rule they are refused. Joining needs a room that exists; it no
    longer creates one. Getting a token alone (`/v1/voice/token`) does not
    check the premium subscription that joining does.
-   **Moderation acts in the call.** A mute mutes the person's published audio
    tracks in LiveKit and takes away their permission to publish; a removal
    disconnects them. Both are recorded first and outlive the connection: a
    removed account gets no new token for that room and cannot join it through
    the API until a moderator readmits it, and a muted account's new tokens
    cannot publish until it is unmuted. **A token already issued is not
    revoked.** One the API issued lives two minutes, and LiveKit can give a
    connected client a refreshed token of its own, whose lifetime LiveKit's
    server sets. Until such a token expires, a removed person's client that
    kept it can rejoin the call, and a muted person who reconnects with a token
    issued before the mute can speak; a connection made that way stays until a
    moderator acts again. A lock refuses new joins and tokens but does not end
    connections already made. Without LiveKit configured, mute and remove do
    nothing and say so (503); when LiveKit fails, the record stands, the answer
    is 502, and it says the person may still be heard or connected until the
    moderator retries.
-   **When the homeserver cannot be read** (no bot token, an error), nobody has
    an elevated role: creating and moderating are refused, a locked room is
    refused with the reason, and an unlocked room still admits the account as
    a member, so an ordinary join does not depend on the homeserver. While that
    holds the ban and membership checks cannot run either: during a homeserver
    outage a banned account can enter an unlocked room. The list of open rooms
    shows every unlocked room to every signed-in account, rooms of canopies the
    viewer cannot enter included.
-   **A room's event feed** (who is in it, its join, leave and moderation
    history, and the mutes and removals that stand) is for joined members of
    the canopy. A room that does not exist and one the caller may not read get
    the same answer.
-   **Next:** in
    [`docs/security/capability-header-triage-2026-10-23.md`](docs/security/capability-header-triage-2026-10-23.md),
    V4's residual (tokens already issued; closing it needs LiveKit's webhooks)
    and V5 (the operator's billing decision on the token route).

---

### Key-transparency log (2026-10-25)

-   **Where:** `packages/api/src/routes/keyTransparency.ts`;
    [`docs/security/key-transparency.md`](docs/security/key-transparency.md).
-   **State:** the server side exists — an RFC 6962 log of cross-signing master
    keys with inclusion and consistency proofs — and since 2026-10-25 only a
    signed-in caller can append, and only for their own account (before that
    anyone could publish any key under any user id, into the log a client is
    meant to check its own key against). No shipped client publishes a key to it
    or checks a proof, so today it detects a key substitution only for an auditor
    who reads it. It is in memory unless `KT_LOG_FILE` is set and its tree heads
    are unsigned unless `KT_WITNESS_ED25519_SEED` is; no tracked deploy file sets
    either.
-   **Not there yet:** client publication and verification; a bound on how often
    an account may append; witness gossip across deployments.

### API write routes that took no session (2026-10-26)

-   **Where:** app installs (`/v1/apps`), federation links
    (`/v1/federation/links`), passkey registration (`/v1/auth/webauthn`), the
    Coliseum challenge "seen" ping, and the admin writes behind the admin API
    key; F5–F9 in
    [`docs/security/api-findings-triage-2026-10-25.md`](docs/security/api-findings-triage-2026-10-25.md),
    which lists every write route in the API and the check it makes.
-   **App installs:** installing an app in a canopy, revoking it, and recording
    an action it ran take being that canopy's admin on the homeserver (able to
    change its power levels); its moderators cannot. While the API cannot read
    the canopy from the homeserver, all three are refused. No app runs yet: an
    install records scopes that nothing acts on.
-   **Federation links:** a link takes an admin of both canopies, so two
    communities with different admins cannot be linked; there is no way for one
    to propose and the other to accept.
-   **Passkeys:** still off unless `WEBAUTHN_ENABLED=1`, and no app offers them.
    Registering one needs the account signed in, and a passkey already
    registered cannot be registered again by anyone. Signing in with one checks
    the passkey and starts no session, and anyone can ask whether an account has
    passkeys.
-   **Admin API key:** ad-revenue periods and payouts, capturing and refunding
    tips, creator subscriptions and boost pledges, and comping or refunding a
    subscription answer 503 until the operator sets `BLACKOUT_ADMIN_API_KEY`.
    Before 2026-10-26 an unset key fell back to a value printed in the source.
-   **"Seen, No Response" in the Coliseum:** only the person challenged, signed
    in, can record that they opened a challenge; opening it signed out records
    nothing. No app sends the ping yet, so through the apps no challenge shows
    as seen.

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

The API's own sign-up routes honour the same gate: with `REQUIRE_INVITE_TOKEN=1`,
`POST /v1/auth/register` and, since 2026-10-25, the no-PII
`POST /v1/auth/account-number` refuse without an invitation token. Before that
date the account-number route minted a Matrix account with no invite check
(D3 in [`docs/black-mask-account-link-design.md`](docs/black-mask-account-link-design.md) §7;
fixed in [`docs/security/api-findings-triage-2026-10-25.md`](docs/security/api-findings-triage-2026-10-25.md)).
The web client's anonymous sign-up does not send a token yet, so with the gate
on it is refused until it does.

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
