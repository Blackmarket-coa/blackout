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

### Panic wipe (2026-10-26)

-   **Where:** Settings → Help & advanced → Panic wipe
    (`apps/blackout-client/src/app/features/panic/`).
-   **It removes only some localStorage entries:** unsent drafts, the list of
    burner identities and the account to go back to from one, saved
    steganography passphrases and settings, the data-broker deletion details,
    ephemeral-drop view counts and reading positions. Until 2026-10-26 its
    screen said it cleared the "sensitive data this app stores on this
    device", which it never did; the screen now lists what it removes and
    what stays.
-   **What stays:** the Matrix client's IndexedDB stores, which hold this
    device's copy of your rooms and recent messages and the encryption keys
    that decrypt your messages (the app does not encrypt these stores:
    `initRustCrypto` is called without a storage key or password); the
    original videos in the device's video vault; the release-key store
    (private release keys and the list of people compared with, see Release
    keys below) unless its option is ticked; and everything else the app
    keeps in localStorage, such as settings, per-room notification choices,
    recent reactions and GIFs, saved homeservers and the Matrix client's own
    entries.
-   **"Also delete release keys from this device"** is off by default. Ticked,
    it deletes every account's release keys and comparisons on the device, and
    the screen says first that without a recovery file they are gone for good.
    If that deletion fails, the screen says so and does not reload.
-   **"Also forget this device's sign-ins"** (labelled "Also sign out" until
    2026-10-26) removes the stored session of every account on the device,
    burner identities included, and the Blackout API token, so the app opens
    on the sign-in screen. It sends nothing to the homeserver: those sessions
    are not ended there, and they stay on the account's list of sessions.
-   **Not a forensic wipe:** the browser deletes the entries, but their data
    may stay on the disk. Forensic imaging of a seized device (adversary A10)
    is out of scope in [`THREAT_MODEL.md`](THREAT_MODEL.md).

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
    From the moment you confirm, the server process handling your deletion
    has removed your account and your release keys, so your other sessions
    can no longer arm a switch, re-seal one or publish a release key through
    it; it then waits for any arm of yours it was already writing, and
    cancels your dead-man switches that have not fired and removes what you
    put in them, a release switch's sealed copies included (not the copies
    an arm that failed left behind, which no switch names: see Durability
    below). Whether a switch
    has fired is decided on the row the database holds, not on what the
    process handling your deletion knew: where the server runs as more than
    one process, a switch that fired on another process moments before your
    deletion reached one that had not yet been told stays fired, and is
    erased as a fired switch is (below). Where the database does not answer
    that question in time, or fails it, the question is asked again, queued
    (and once more if that fails too, a refused connection included), and
    the deletion is not answered until it has been. Then, as its last step,
    the deletion erases in the database every switch it holds for you the
    same way, including one the process handling your deletion never had (an
    arm of yours answered with an error whose write the database recorded
    anyway, or one another server process accepted before it heard of your
    deletion); that step is waited for at most 10 seconds and can finish
    after the deletion is confirmed. A switch is left as the database had it
    only where all of those fail (each is logged): one that had not fired is
    then still armed there and can fire at its deadline, and its label
    stays. Three other cases can leave a switch armed, able to fire, for an
    account that is gone: an arm whose write the database was still
    finishing after the server had lost its connection to it, recorded after
    that last step; an arm another of your sessions makes on another server
    process that has not yet heard of your deletion, after that last step
    and before that process hears of it (the delay of the server's change
    notifications, not measured); and a server that stops before your
    deletion is confirmed, which can leave any part of it undone (below). A release switch
    that has already fired stays readable to the people it named, with the
    public release key it was signed with, until at least 365 days after it
    fired (it is removed at the server's first sweep after that); a switch
    armed before Blackout could release messages (every switch that exists
    today) keeps its payload for the people it named with no removal date,
    because a release is not taken back. Either way its label is removed,
    except where every attempt to erase the switch failed.
    Copies of other people's releases sealed to you are removed, in the
    database too by the deletion's last step (where the API runs as several
    replicas, one that someone seals to you on another replica that has not
    yet heard of your deletion, after that step, can stay until that release
    is cancelled or removed), a notice still owed to you is
    dropped once your deletion is confirmed (one the bot was already sending
    at that moment can still arrive, and so can the invitation to your
    notices room it was already making). Wherever the server keeps its data
    in a database, the confirmation waits until the server has tried to write
    the deletion's changes there, one server process included, so a database
    that is slow or not answering holds it; behind a proxy that gives up
    first, the screen says the deletion may not have finished although the
    server has already applied it, and if the server then restarts before
    its database answers, the deletion is lost and the account is back.
    Where the server also runs its background work in a separate process,
    the bot can still send you a notice until the confirmation, and after it
    too if the server's write removing your copy fails (it logs that) before
    the deletion's last step below has run.
    The record of each notice (its status and attempts) stays, with its
    room forgotten (where the server runs its background work in a separate
    process, the last step of the deletion does that for a notice the
    deleting process had not heard of yet, and is waited for at most 10
    seconds, so it can finish after the deletion is confirmed; until it
    finishes, and for good if it fails, which the server logs, such a notice
    the bot was already sending keeps its room). A hold on your notices that
    the bot's work left behind when it stopped or could not give it up (your
    account id, a random token and when it expires) stays too. It
    removes the release keys you published (their public halves), except the
    copy kept with a release switch of yours that has already fired, which goes
    with that release (where the API runs as several replicas, one that
    another of your sessions publishes on a replica that has not yet heard of
    your deletion, in that moment, stays); the fingerprint of the key each
    sealed copy was made for stays on the blanked copy rows. The private keys
    on your devices and in your recovery files stay until you remove them. It
    does not yet deactivate your Matrix account, and your
    messages stay in rooms. If an anonymous sign-up used an invitation, the
    record tying that invitation to your Matrix account is removed too. Where
    the inviter's list of who joined through their link includes you, that
    entry stays, showing an internal id where your name was.

### Dead-man's switch (experimental)

-   **Where:** the Deadman Switch panel at `/deadman`
    (`apps/blackout-client/src/app/features/deadman/`) and the API's
    `/v1/deadman` routes (`packages/api/src/modules/deadman.ts`). The panel
    is shown to every account by default (client flag `deadman`).
-   **State (2026-10-29):** you can check in and cancel the switches you
    have, from the app or the API. You cannot arm a new one yet: the API
    refuses every arm (409 `arming_unavailable`) until an operator turns
    `BLACKOUT_DEADMAN_RELEASES` on, which no deployment file does, and
    wherever the API's own environment has the sweep switched off
    (`BLACKOUT_DEADMAN_SWEEP=0`), since a switch armed there would never fire;
    `GET /v1/deadman/limits` says which closes it. The app's
    arming form and "Released to you" view are the next PR of
    [`docs/security/deadman-release-design-2026-10-24.md`](docs/security/deadman-release-design-2026-10-24.md).
    The API's side of the release is built
    ([`docs/security/release-envelope-2026-10-26.md`](docs/security/release-envelope-2026-10-26.md)):
    a switch armed in the release format holds a message encrypted on the
    owner's device for each person named, who must have release keys on this
    server; when it fires, each of them can fetch their own sealed copy
    (`GET /v1/deadman/releases`), and the Blackout bot tries to tell them
    (below). When an existing switch fires, Blackout does not notify anyone or
    post anything: the switch only changes status to `triggered`. Do not rely
    on a switch for anyone's safety.
-   **What the bot's notice is.** One message from the Blackout bot in a room
    it makes for you, "Blackout notices", which is **not end-to-end
    encrypted**: the bot cannot encrypt, so its message is plaintext whatever
    a room's state says, and the room is created so that the homeserver's
    encryption backstop (above) does not mark it encrypted (the `public_chat`
    preset with an invite-only join rule; the backstop keys on the preset).
    The bot makes one such room for you and reuses it; the cases below can
    leave you an extra one. The room is not in the
    homeserver's public room list. It has an address made from your Matrix id
    under a secret the server keeps, so nobody without that secret can work
    it out from your Matrix id or tell from it whose room it is; it is there
    so that a room the homeserver finished making after the bot stopped
    waiting is found again rather than made twice. Where the homeserver
    refuses that address, where it names a room that is gone or that the bot
    did not make, where the server has the bot's own id wrong, or where the
    server's secret changed in between, a homeserver that is slow to make the
    room can still leave you an extra, empty "Blackout notices" room with an
    invite, one per such attempt. A homeserver that stops partway through
    making the room (a restart or an error at the wrong moment) leaves that
    address naming a room it never finishes: with nothing in it, or without
    the bot in it, or without the settings that keep you from posting there.
    The bot uses a room at that address only once it is finished and the bot
    is in it; otherwise it waits one retry (at least 30 seconds after it first
    looked) and then makes your room without the address, and a homeserver
    that was only that slow leaves you an extra room the same way. If the
    server's background work stops right after the homeserver made your room
    (a crash, or a restart while its database is stalled), before its
    database has a record of the room, the next attempt finds no room and,
    if the homeserver refuses the address, makes you another, so you have an
    invitation in each and the notice in the second. Where the server runs
    more than one copy of its background work, as it does for a moment while
    one takes over from another, each takes a hold on your notices in the
    server's database before it works on them, and the other leaves them
    alone while it is held, and also when its own request for the hold fails
    or goes unanswered; only if one holds on past that hold's time limit
    (7.5 minutes: a copy that stalled or was paused, or whose database writes
    are still waiting when it ends) can two of them work on your notices at
    the same moment and, if the homeserver refuses the address, each make you
    a room and send its notice there, so you can get an invitation and the
    notice in each of two rooms. Within one room the homeserver drops a second send of the same
    notice while it still remembers the first: for 30 to 60 minutes, or 24
    hours if the bot's token came from a sign-in, and the shorter of these is
    forgotten if the homeserver restarts.
    A fixed sentence, "There is something new for you in Blackout. Open
    Blackout to see it. This room is not end-to-end encrypted, so please
    don't reply here.", and the release's id, and nothing else: not who armed
    the switch, not their label, not who else was named, nothing of the
    message. Anyone who sees your notifications, and your email provider if
    the homeserver emails you about unread messages, can see that you got one.
    The bot retries a notice the homeserver refuses for 30 days, then records
    it as failed, and gives up on a call the homeserver does not answer within
    30 seconds the same way. It sends one notice at a time, and one notice can
    take up to seven calls to the homeserver and six to the server's own
    database (four reads, and taking and giving up its hold on your notices),
    each given 30 seconds, so a homeserver or a database that answers nothing
    holds every notice due behind it, each for up to 30 seconds, and ones
    that answer slowly, just inside the 30 seconds each time, can hold each
    for about six and a half minutes and a batch of 50 for about five and a
    half hours. Whether
    a notice reaches you depends on the homeserver and your client, and the
    release does not: it is released when the API's own store says so, and
    the view the next PR adds reads that store.
-   **Who can name you, and what that does to your notices room.** Any
    account on this server with release keys can name you on a release switch
    without your agreement; the design asks the owner to compare a safety code
    with you first, and the server cannot tell whether they did. The API
    bounds it: one account can name you on at most 5 held releases, and at
    most 50 accounts can name you at a time, so at most 250 held releases
    name you (`GET /v1/deadman/limits`; a release is
    held from arming until it is removed, at the server's first sweep at
    least 365 days after it fires). The bounds hold on one
    API server against requests sent all at once (the server counts the arms
    it is still writing, and while a database write of a switch stands
    unanswered it refuses every arm until that write's row is in its memory).
    A deployment running several API replicas can exceed each: a replica
    sees another's arms only once that replica's database has confirmed them
    and its change notice has arrived, so across replicas a burst can exceed
    a bound by up to its own size for that long; how long that is was not
    measured. Each one that
    fires puts
    one notice in your notices room, and if you left that room the bot
    invites you back, once per notice. You cannot yet refuse an owner, and
    release keys cannot be unpublished, so the only way to stop being named is
    to delete your account.
-   **The bound of 50 accounts can be used to stop others naming you, and many
    people at once.** One release switch can name up to 64 people, and an
    account counts once toward each person it names, so fifty accounts on this
    server, each with release keys and each naming the same 64 people on one
    release switch, fill the bound for all 64 of them; each of those accounts
    can hold 20 switches naming 64 different people, so fifty accounts can do
    it to 1,280 people, in two days at the limit of 10 arms a day: about 26
    people for every account someone controls. From then on any other account
    that names one of those people on a release switch is refused (it sees
    the refusal, 409 `recipient_limit`, and, if it names the person on no
    release of its own, can tell it is the bound on accounts), for as long as
    those accounts keep their switches armed, which takes one check-in per
    switch per interval, and an interval can be as long as 365 days, and for
    at least 365 days after the switches fire; deleting those accounts does
    not free the places of switches that have fired, since a fired release
    stays for the people it named. Neither you nor anyone else can clear it
    through the app or the API: new release keys change nothing, you cannot
    cancel someone else's switch, and no administrator route removes a
    release (short of an operator editing the database). Until 2026-10-31
    the bound counted releases (50 from everyone), and ten accounts could do
    the same; the operator chose to count accounts, which raises what it
    takes to fifty accounts, not the number of people each account can
    block, and lets 250 releases name one person rather than 50
    ([`docs/security/release-envelope-2026-10-26.md`](docs/security/release-envelope-2026-10-26.md),
    decision 18). A way for you to refuse an owner, which would let you clear
    it yourself, is not built.
-   **What the server can do with a release.** It keeps the timer and the
    sealed copies, so whoever runs or compels it can hold a release back,
    delay it, or give the people named their copies early; nobody is told. As
    long as the owner compared a safety code with each person named and
    nobody's app code was altered, it cannot read the message, and cannot
    forge one or make a copy open for anyone but its recipient. In a web
    browser the server supplies that code, and a server made to send altered
    code could read the message as it is typed; the desktop and mobile apps
    carry their own copy. Without the comparison, a key the server planted in
    the directory would let it read the message from arming on, and the API
    cannot tell. An outage of the server's background work or of its
    database delays a release by its own length plus up to 72 hours (below);
    while the database does not answer, check-ins are refused too.
    [`THREAT_MODEL.md`](THREAT_MODEL.md), R12.
-   **Retention.** At its first sweep pass on or after 365 days after a
    release switch fired, Blackout removes the encrypted message, the owner's
    public key kept with it and every sealed copy from its database (a
    deployment running no sweep removes nothing). The record of the switch
    stays: whom it named and the fingerprint of the key each copy was sealed
    to, the owner's label and timing, when it fired, and each notice's status
    and attempts, and its room until that person deletes their account; the
    switch stays in the owner's list as fired, with how many notices were
    sent. Save the message before then if you need it after. Cancelling a
    release switch removes its encrypted message and every copy (a cancel the
    database confirms only after the server has answered 503 removes the
    copies when it does, and the switch then shows cancelled, as long as the
    server process that sent it is still running; if that process stopped
    first, the copies stay until the server's background work next writes
    that switch, at the switch's former deadline, or a check-in or a second
    cancel finds it cancelled; the sweep's pass also removes any copy still
    held on a cancelled release switch that its own process knows is
    cancelled); backups keep them until they expire. Where the API runs as several
    replicas, a re-seal the owner's device makes on another replica in the
    moment the cancel is reaching it can leave one sealed copy on the
    cancelled switch, given to nobody (a cancelled switch is never released),
    until the next sweep pass removes it.
-   **Bounds.** One account can have at most 20 release switches whose
    content the server still holds (armed, in grace, or fired until the
    removal), about 7 MiB of encrypted headers and up to about 2.3 MiB of
    sealed copies at the largest sizes; can arm at most 10 in any 24 hours;
    and can name one person on at most 5 held releases, who can be named by
    at most 50 accounts at a time (which fifty accounts can fill: above).
    `GET /v1/deadman/limits` reports each. The bounds
    hold on one API server against requests sent all at once; across several
    API replicas a burst can exceed each by up to its own size until each
    replica's arms are confirmed by the database and announced to the others
    (above). An owner whose 20
    switches all fired cannot arm
    again until the oldest is removed; cancelling an unfired one frees its
    place. These bound content, not rows: a cancelled release switch leaves
    its row (whom it named, the label and timing) and one blanked copy row
    per person named (account id, key fingerprint, timestamps) for good, so
    arming and cancelling at the rate adds up to 10 switch rows and 650 copy
    rows a day to the database.
-   **Durability.** In Postgres mode the API answers most writes before they
    commit (a write-behind queue, drained on shutdown), so a crash in that
    window can lose the newest rows. Arming is the exception: it is answered
    201 only once the database holds the switch and its sealed copies, written
    in one call in that order and never deleted, so a stop between them, a
    failed arm, or two servers arming the same message at once leave at most
    copies no switch names, which nothing lists, serves or counts, which the
    named person's account deletion removes like any other and which arming
    the same message again writes over (your own account deletion removes
    only your own copy among them: the others stay, sealed, until each
    person named deletes their account), and never a switch that fires with
    copies missing. An arm whose statement the database fails is looked up
    again: if your switch is there (the connection can drop after the
    database committed it), it is answered 201 and listed (a switch of
    someone else's with the same id is refused as already taken); if it is
    not, 500 with
    nothing armed (except that a statement the database was still running
    when it lost its client can commit after that look, in which case arming
    the same message again is refused as already taken and the switch then
    appears in your list; if you do not arm it again, the switch is in the
    database but none of the server's running processes knows of it, so it
    is neither listed nor fired until one of them restarts and reads it, and
    is then handled as any switch is, a late one as below); if the look-up
    fails too, 503, and a switch the database did record is in the same
    position. One the database
    does not confirm within 30 seconds is 503, in which case it may still
    land, and the switch then appears in your list (arming the same message
    again is then refused as already taken); one sent while an earlier write
    of a switch on that server still stands unconfirmed is 503 at once
    without being sent, so it cannot land, until that write's row is in the
    server's memory. If a switch with the same id already exists in the
    database, the arm is refused as already taken and that switch is taken
    into the server's memory, so your list shows it. A re-seal's copy is still a write-behind write: one that
    fails twice is dropped (`db_write_behind_failed` in the logs), and the API
    process that made it alone holds the new copy, serving it to that person
    when their request reaches that process, until it restarts. The bot reads
    each copy from the database before it makes a room, invites or sends, so a
    person whose copy is missing there is not sent a notice: where the bot
    runs in that same process the notice is recorded as failed with
    `copy_unavailable`, and where it runs in a separate worker, which never
    had the copy, no notice is written for them at all. A switch armed before
    this change whose write was dropped is in the arming process's memory
    only: where that process runs the sweep, the sweep writes it whole to the
    database when it fires it (`deadman_switch_row_restored` in the logs); in
    the deployed layout, where the sweep runs in another process, such a
    switch never fired and no process but the arming one listed it, which is
    why arming now waits for the database.
-   **Check-ins and cancels are checked against the database.** Where the
    API runs as more than one process, the one your check-in or cancel
    reaches may not yet have heard that your switch fired; the write is made
    only if the database still has the switch as that process read it, so
    one that comes after the switch fired is refused (409
    `switch_triggered`, on whichever attempt finds it so) rather than setting
    the switch back to armed while its release stays out, and one after a
    cancel 409 `switch_cancelled`. The write waits for that process's own
    earlier writes to the same switch and for the database, not for its
    writes to other tables; one the database does not confirm within 30
    seconds is answered 503 (`switch_write_unanswered`): it may or may not
    have been recorded, and doing it again is safe. While such a write stands
    unconfirmed, every further check-in and cancel on that process is
    answered 503 at once, without being sent, so those were certainly not
    recorded, until it settles, which is when its row is in that server's
    memory; a cancel the database confirms late takes
    effect then (the switch shows cancelled and its copies are removed), and
    a check-in confirmed late counts. The server's own move of a switch
    (into grace, or firing it) is checked the same way and reaches the
    process's memory only once the database has it, so nothing is served or
    sent for a firing the database refused; one the database does not
    confirm is tried at the first pass after the database answers, and while
    one stands unconfirmed no switch moves on that process. A database that
    does not answer is treated as an outage of the sweep: a switch due while
    its statements stood unanswered, or whose check-in or cancel was refused
    that way on the process that runs the sweep, gets the backlog window
    (below) at the first pass after it rather than firing, within the 15
    minutes or not. Where the API and the sweep are separate processes
    (`deploy/docker/production`), the sweep knows only its own process's
    stalls and refusals: a check-in refused on an API process never holds
    the switch back by itself. The worker gives the window only to a switch
    whose deadline falls inside one of the worker's own stalls, or whose
    check-in the worker itself refused, so a check-in refused on the API
    process during a database outage that ends before the deadline leaves
    the switch to fire at its deadline unless you check in again once the
    database answers (the 503 tells you the check-in was not recorded),
    whether or not the worker met that outage.
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
    have not fired and removes their payloads and labels, and a release
    switch's sealed copies, except in the cases "Deleting your account" above
    names; a switch that has already fired, by the database's
    row rather than by what the process handling the deletion knew, keeps what it
    holds for the people it named, because a release is not taken back: a
    release switch its encrypted message until at least 365 days after it
    fired, a switch armed before releases (every switch that exists today)
    its payload with no removal date. Where the deployment keeps database
    backups, they hold a removed payload until they expire.
-   If the server reaches your switch more than 15 minutes (by default) after
    it was due, because its background loops were down, it does not fire the
    switch then: the switch goes to grace with at least 72 hours left from
    that moment, once per missed check-in, and a check-in ends that as usual;
    the same window is given, within the 15 minutes or not, when the
    database did not answer the sweep's own process at some moment since the
    switch was due (above). So an outage of the server's background work or
    of its database can delay a release by its own length plus up to 72
    hours.
    The grace and triggered events the sweep records stay in the memory of
    the process that ran it, so where that is a separate worker
    (`deploy/docker/production`) the event feed does not list them; the
    switch's status and release time do show them.
-   What a switch will release, and to whom, was decided on 2026-10-24 (N2 in
    [`docs/security/deadman-and-feeds-triage-2026-10-12.md`](docs/security/deadman-and-feeds-triage-2026-10-12.md)):
    the design above. Its server side is built; until the app's side ships
    and an operator turns the flag on, nothing is released and arming stays
    closed.

### Release keys (2026-10-26)

-   **Where:** Settings → Account & identity → Release keys
    (`apps/blackout-client/src/app/features/release-keys/`), and the API's
    `/v1/release-identities` routes (`packages/api/src/routes/releaseIdentities.ts`).
    Format and review:
    [`docs/security/release-identities-2026-10-26.md`](docs/security/release-identities-2026-10-26.md).
-   **What they are for:** the dead-man switch release
    ([`docs/security/deadman-release-design-2026-10-24.md`](docs/security/deadman-release-design-2026-10-24.md)).
    Its server side is built: a switch armed in the release format seals its
    message's key to the current release keys of each person named and to the
    owner's own, and the API checks every copy against the keys published
    here. You can create release keys, publish their public half, save a
    recovery file and compare a safety code with someone, but arming stays
    closed on every deployment until an operator turns
    `BLACKOUT_DEADMAN_RELEASES` on, so nothing is encrypted for these keys yet.
-   **Lose the device, lose the keys.** The private keys live only on the
    devices that made them or loaded a recovery file, and in the recovery
    files you save. A device that is lost, reset, or whose browser deletes
    the site's data (clearing browsing data does; browsers may also evict a
    site's storage, Safari among them after a period without a visit) loses
    them, and Blackout cannot bring them back: it never had them. Creating
    new keys does not recover old ones, and everyone who compared a code
    with you has to compare again. Save a recovery file, and save a new one
    after each comparison: a file holds only the comparisons made before it
    was saved.
-   **Signing out leaves them, and so does the panic wipe unless told
    otherwise.** Signing out never removes release keys from the device, where
    any code running in the app's origin can read them; the panic wipe removes
    them only when its "Also delete release keys from this device" is ticked,
    and it is off by default. "Remove release keys from this device" removes
    them; on a device other people use, save a recovery file, then remove them
    before you sign out. Another open tab that showed them keeps them in
    memory until it is closed or reloaded (the panic wipe reloads only its
    own tab), though it can no longer save or publish them.
-   **Recovery file:** encrypted with your passphrase (at least 12
    characters; argon2id, then AES-256-GCM). Anyone with the file who guesses
    or learns the passphrase can use your release keys, and Blackout cannot
    reset a forgotten passphrase. The app asks the browser to download the
    file; whether that works in the desktop and mobile apps was not tested,
    so check that the file was saved. The passphrase fields ask the browser
    not to offer saving the passphrase (`autocomplete="off"`), but browsers
    may offer it anyway; don't let one save it, as the screen also says.
    Loading a file whose current key is older than this device's, was
    replaced, or is neither the server's current key nor one this device
    holds, asks before it changes which key this device uses.
-   **What the server sees:** the public half of your keys, and the keys you
    replaced, which any account signed in on this homeserver can read, and
    who looked up whom (the Matrix id you look up travels in the request
    body, not in the URL that proxies log). The server could hand out a key
    that isn't the person's. A safety-code comparison shows whether the key
    you were given is theirs, at the time you compare, and only if you read
    all twelve groups: checking a few is far weaker. Compare in person if you
    can; on a call, know that a voice can be imitated. A comparison says
    nothing about keys published later. In a web browser the server also
    supplies the app's code, which a comparison cannot check.
-   **Publishing:** creating keys publishes them, and the listing stays until
    your account is deleted; there is no way to unpublish. An account can
    publish at most 3 new release keys in any 24 hours, and 1000 in all, and
    anyone using your account shares that limit with you. The server refuses
    a key it has seen for your account before, so a published key you
    replaced can't be made current again. It can't refuse an older key it
    never saw: release keys carry no sequence number, so a key you replaced
    before it was ever published (after the daily limit, say) can still be
    published later, from another device of yours or by someone with access
    to your account who has it, and it then replaces your newer key for good.
    Publishing from this app always uses the keys this device stores at that
    moment, so a tab left open on older keys can't do it. If Blackout's
    server shows a key for you that you didn't make, someone with access to
    your account, or the server, published it; the screen says so.
-   **A lost device:** replacing your release keys doesn't sign it out. End
    its Matrix session from a Matrix client that lists your account's
    sessions, or by resetting your password with “Sign out of other
    devices”; then “Sign out every Blackout session”, on the Release keys
    screen, ends every Blackout session of your account, this device's
    included (it gets a new one from its Matrix session). Until both are
    done, whoever has the device can publish keys of their own in place of
    yours, which retires yours for good, and can use up the account's 3 a
    day. An account made with an email and password through Blackout's API
    keeps that password apart from Matrix: a Matrix reset doesn't change it,
    and this app has no screen to change it. An API token issued in the same
    second as the sign-out isn't refused; it expires within 24 hours.
-   **Only this homeserver:** a Matrix id on another server finds nobody.
-   **Devices:** a browser or webview needs WebCrypto Ed25519 and X25519 and
    IndexedDB; the screen says so when one is missing. Support was read from
    MDN's data, not tested on devices.

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

### Voice rooms in the API (2026-10-26)

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
    revoked.** One the API issued lives two minutes, and LiveKit's server gives
    a connected client tokens of its own, each valid for ten minutes and renewed
    every five. With one, a removed person's client can connect to the call
    again, and a muted person can reconnect with a token from before the mute
    and speak.
-   **Applied again on arrival, where LiveKit sends its webhooks to the API.**
    The LiveKit server can be configured to tell the API who joins and who
    publishes (`POST /v1/voice/livekit/webhook`; the single-server stack's
    LiveKit configuration does, and `packages/api/README.md` gives the snippet
    for others). Where it is, the API disconnects a removed person, or mutes a
    muted one and takes away their publishing, as soon as LiveKit reports them
    joining or publishing, whatever token they used; and a mute or removal
    LiveKit could not carry out when it was made is applied at the person's
    next reported join or publish. They are still in the call for the moment
    that takes. A report LiveKit drops or gives up on leaves them there until
    their next join or publish, so a removed person who reconnects and only
    listens can stay. Someone who never reconnects is left to the moderator's
    own action. **Without the webhook**, a connection made with an earlier
    token stays until a moderator acts again. A lock refuses new joins and
    tokens but does not end connections already made, and a token issued
    before the lock still connects, webhook or not. Without LiveKit
    configured, mute and remove do nothing and say so (503); when LiveKit
    fails, the record stands, the answer is 502, and it says the person may
    still be heard or connected until the moderator retries.
-   **What the webhook gives the API.** LiveKit sends the events of every room
    on that server, MatrixRTC calls included: for those, with the
    lk-jwt-service 0.2.3 the single-server stack runs, the Matrix room id and
    each participant's Matrix user id and device id. The API acts only on
    rooms it created, and keeps and logs nothing about the others.
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
    V5 (the operator's billing decision on the token route), V10 (a lock is
    not applied on arrival), and the operator's decisions on the webhook
    (2026-10-26 section).

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

### OIDC sign-in checks (2026-10-30)

-   **Where:** the homeserver's OIDC login (`oidc_providers`,
    `apps/blackout-server/synapse/handlers/oidc.py`);
    [`docs/security/dependency-advisories-server-desktop-2026-10-30.md`](docs/security/dependency-advisories-server-desktop-2026-10-30.md),
    sections "Claim checks the bump did not change" and "The claim-type
    checks". The first two gaps below are in upstream Synapse too, and
    neither changed with the authlib 1.9.1 bump. The third came with the
    bump, as it did upstream.
-   **Unsigned id_tokens:** the id_token's signature is checked against the
    algorithms the identity provider lists in
    `id_token_signing_alg_values_supported`. If that list has `none`, an
    unsigned id_token is accepted. What then stops a forged one is the TLS
    connection to the provider's token endpoint, the one place the id_token
    is taken from. Metadata validation requires that endpoint to be `https`,
    or `http` to a loopback address, unless the provider's
    `skip_verification` is set. OIDC allows this for the code flow. Keycloak and Authentik, the
    providers the shipped template names, do not list `none` for id_tokens
    (read from their source, not from running instances). Back-channel logout
    tokens refuse `none` whatever the provider lists.
-   **Audience:** `aud` is not compared with this homeserver's client id when
    the token's `azp` names it. An id_token with `aud: "other"` and `azp` set
    to our client id is accepted, as is one listing extra audiences. OIDC Core
    3.1.3.7 says such a token must be rejected. The token must still be
    signed by the provider and come from its token endpoint.
-   **Claim types (since the authlib 1.9.1 bump):** an identity provider
    whose id_token carries a `sub` or `jti` that is not a string, or an
    `aud` list with a member that is not a string, can no longer sign in;
    the callback shows `invalid_token`. This holds with
    `user_profile_method: userinfo_endpoint` too, whenever the `openid`
    scope makes the provider send an id_token. An integer user id still
    works only from the userinfo endpoint of a provider that sends no
    id_token (GitHub-style OAuth2, or scopes without `openid`).
-   **Not there yet:** refusing `none` for id_tokens (it could break a
    compliant provider), and comparing `aud` with the client id.

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
Since 2026-10-26 the web client's anonymous sign-up sends the invitation token
the invite link left in the tab, and the redeem it makes after sign-in claims
the use that sign-up spent instead of spending a second one, so the setting can
be turned on without breaking that sign-up; no tracked deploy file turns it on.
With it on, an anonymous account can be created only in a tab that opened an
invitation link: anywhere else, the Black Mask chat panel included, the sign-up
is refused and says an invitation is needed. A new account whose first sign-in
happens in another tab leaves its invitation's use spent with no redemption
recorded, so the inviter sees the use but gets no follower. With the setting on
or off, an invitation the server no longer accepts (not recognized, used up,
expired or revoked) stops the anonymous sign-up in the tab that holds it, and
the form says why.

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
