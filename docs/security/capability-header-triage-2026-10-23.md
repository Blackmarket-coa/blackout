# Session capabilities and the `x-blackout-capabilities` header — triage, 2026-10-23

The API's per-domain scopes (`governance.write`, `moderation.write`, ...) were
granted by the union of the session token's `capabilities` claim and whatever
the caller listed in the `x-blackout-capabilities` request header. Only
`admin.*` and `*` were refused from the header, so any signed-in account could
grant itself every other scope by naming it. This record covers the fix the
operator decided on (a staged one), the inventory it was built from, and what
is still open. Every finding gets a fix or a written reason, per the standing
rule in this directory.

Written against `develop` at `291f593`, with the change set that fixes it; the
dated section at the end, against `develop` at `6ea67c4`, with the change set
that fixes O4. **Read** below means the claim rests on the code; **Run** that
it was observed by running it; **Test** names the regression test that drives
the real Hono app (in memory mode, against the stub homeserver in
`packages/api/test/_fixtures/matrixStub.ts` where a homeserver is involved),
so CI's `api-smoke-and-integration` job keeps this record honest.

**Result:** H1 to H5 fixed. O4 fixed on 2026-10-24, with V1 to V3 found and
fixed alongside it (last section). Open: the community role model (O1), the
join rule on listing (O2), scopes that mix owner-checked and shared-state
routes (O3), the rollout window for tokens minted before the change (O5),
whether dead-drop writes can be minted (O6), and, for voice rooms, moderation
that does not reach LiveKit (V4), the token route's subscription check (V5)
and levels in moderation (V7). V6, drop-in rooms, is recorded as unchanged.

| ID  | Finding                                                                                                 | Verified    | Disposition                                                    |
| --- | ------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| H1  | The header added scopes: any signed-in account could hold any per-domain scope                          | Read; tests | Fixed: the header can only narrow what the caller holds        |
| H2  | Write scopes whose routes check ownership were not minted, so clients needed the header for them        | Read; tests | Fixed: `stego.write` and `discovery.write` minted              |
| H3  | Shared-state writes with no ownership or role check had no holder but the header                        | Read; tests | Fixed for now: allowlisted admins only (`ADMIN_ONLY_SCOPES`)   |
| H4  | Canopy listing had no ownership check: any account could list any room id, or rename another's entry    | Read; tests | Fixed: the caller must be the canopy's admin on the homeserver |
| H5  | The New canopy form dropped a failed listing silently while saying a public canopy is listed            | Read; test  | Fixed: the failure is shown                                    |
| O1  | Governance, moderation, forum, channels and growth writes need a community role model                   | Read        | Open: admin-only until then                                    |
| O2  | Listing does not check the canopy's join rule                                                           | Read        | Open, recorded follow-up                                       |
| O3  | `moderation.write` and `growth.write` also guard owner-checked routes, which are admin-only as a result | Read        | Open: split the scopes                                         |
| O4  | Voice-room roles (`admin`, `moderator`) were taken from the request body                                | Read; tests | Fixed 2026-10-24: from the canopy's power levels               |
| O5  | Tokens minted before the change keep the old capability list until they expire or are refreshed         | Read        | Open, transitional                                             |
| O6  | A dead drop can be addressed to any account, and appears in that account's export                       | Read        | Open: admin-only until decided                                 |
| V1  | Joining a voice room created it, with no directory or role check                                        | Read; tests | Fixed 2026-10-24: only create makes a room                     |
| V2  | A voice room's event feed (participants, history) had no sign-in check                                  | Run; test   | Fixed for anonymous callers; signed-in audience open           |
| V3  | An unknown voice moderation action logged a removal that removed nobody                                 | Run; test   | Fixed 2026-10-24: 404 `unknown_action`                         |
| V4  | Voice moderation does not reach LiveKit, and tokens already issued stay valid                           | Read        | Open: stated in `KNOWN_LIMITATIONS.md`                         |
| V5  | `POST /v1/voice/token` skips the subscription check that joining makes                                  | Read        | Open: a billing rule, for the operator                         |
| V6  | Unlocked voice rooms are drop-in for every entitled account, banned ones included                       | Read; test  | Unchanged: the drop-in design; locking is the control          |
| V7  | Voice mute and remove do not compare the moderator's level with the target's                            | Read        | Open, low while V4 stands                                      |

---

## H1 — the header added scopes — fixed

-   **Found:** `canAccessDomain` (`packages/api/src/modules/authz.ts`) built
    the caller's scopes as `claims ∪ header`, dropping only `admin.*` and
    `*`-prefixed entries from the header. Session tokens deliberately carry
    write only for `streaming` and `profile` (`deriveUserCapabilities` in
    `packages/api/src/services/auth.ts`, "to avoid universal write access"),
    and the header undid that: any signed-in account could hold a scope its
    token left out by naming it there, so the governance, moderation, forum,
    channels, growth and dead-man writes were open to every account.
-   **Verified:** read on `develop`; 26 API test files sent the header (47
    times), most of them to obtain a scope the token lacked. The shipped
    senders were
    `apps/blackout-client/src/app/features/discovery/discoveryClient.ts`
    (`discovery.write`) and the Expo scaffold's
    `packages/mobile/app/(tabs)/governance.tsx`
    (`governance.read,governance.write`). Nothing else in the tree sets the
    header: no constant, no concatenation, and `packages/blackout-sdk` only
    passes through `defaultHeaders`, whose callers in the client set
    `authorization` or `x-matrix-access-token`.
-   **Fix:** the caller holds what the token's claims grant (`admin.*` in the
    claims is still the superuser grant), plus the admin-only scopes (H3) when
    the caller is an allowlisted admin. When the header lists scopes, the
    request may use only those, and only as far as the caller holds them: it
    narrows, never adds. `admin.*` and `*` entries in it are dropped as before,
    and a header that lists nothing usable counts as absent. The comment in
    `routes/coalitions.ts` that relied on the old behaviour now says why the
    takedown routes use the allowlist instead.
-   **Test:** `test/capability-header.integration.test.ts`: H-2 (a default
    token naming each unminted write scope, its `domain.*`, `admin.*` or `*` in
    the header gets 403 `missing_capability` and writes no row), H-3 (the same
    routes accept a token whose claims carry the scope, so H-2 reaches them),
    H-5 (a header that leaves a held scope out removes it for that request,
    for minted and claimed scopes alike), H-6 (`admin.*` in the header grants
    nothing; in the claims it is the superuser grant). In
    `test/security-hardening.integration.test.ts`, SEC-1 now asserts that a
    concrete scope in the header no longer grants it.

## H2 — owner-checked write scopes are minted — fixed

-   **Found:** `stego` and (after H4) `discovery` writes check ownership on
    every route, but tokens did not carry the scope.
-   **Verified:** read. Stego channels live in one bucket per account
    (`services/stegoStore.ts`), and stego has no event feed; canopy listing is
    H4, and the other discovery writes are H3.
-   **Fix:** `deriveUserCapabilities` mints `stego.write` and
    `discovery.write`. **Not minted:** `deadman.write`, although its routes are
    owner-scoped: whether the app may arm a dead-man switch is decision N2
    ([`deadman-and-feeds-triage-2026-10-12.md`](deadman-and-feeds-triage-2026-10-12.md),
    D4), and minting it would switch that on. No admin holds it either. Nor
    `deaddrop.write` (O6). (2026-10-26: `deadman.write` is minted. N2 was
    decided in
    [`deadman-release-design-2026-10-24.md`](deadman-release-design-2026-10-24.md),
    and its PR 1 made `POST /v1/deadman/switches` refuse every arm itself,
    409 `arming_unavailable`, so the scope no longer switches arming on;
    check-in and cancel, owner-scoped, work from the app. D4 closed.)
-   **Test:** H-1 pins the minted write scopes (`discovery`, `profile`,
    `stego`, `streaming`) and that every unminted write scope is covered by
    H-2 to H-4; H-4 checks that an allowlisted admin still cannot arm a
    switch.

## H3 — shared-state writes are admin-only for now — fixed for now

-   **Found:** governance, moderation, forum, channels, growth and dead-drop
    writes change shared state with no ownership or role check (inventory
    below). With the header gone, nobody would hold them.
-   **Fix:** `ADMIN_ONLY_SCOPES` in `authz.ts` (`governance.write`,
    `moderation.write`, `forum.write`, `channels.read`, `channels.write`,
    `growth.write`, `deaddrop.write`): an account on `BLACKOUT_ADMIN_USERS`
    holds them, checked at request time like every other admin gate in the
    API. `channels.read` is in the list because `GET /v1/channels` returns
    every community's channels, private ones included, and it was never
    minted. The discovery index writes other than listing (`/index/profiles`,
    `/index/activity`, `/index/jobs/*`, `/analytics/events`) keep
    `discovery.write`, which every token now carries, and also require an
    allowlisted admin (`requireAdminDomainCapability`).
-   **Test:** H-4 (an allowlisted admin makes each admin-only write without the
    header, reads `/v1/channels`, is narrowed by a header like anyone else, and
    is refused again once off the allowlist); H-7 (a default token gets 403
    `forbidden` on each discovery index write and nothing is indexed; an
    allowlisted admin indexes).

## H4 — canopy listing had no ownership check — fixed

-   **Found:** `POST /v1/discovery/index/canopies` (`modules/discovery.ts`)
    upserted any `canopyId` under any name for any holder of
    `discovery.write`, which every account could assert. The entry is what
    voice-room creation (`routes/voice.ts`) and app installs
    (`services/apps.ts`) look for (`hasCanopy`), and the name is what the
    directory shows, so one account could list rooms it has nothing to do
    with and rename other canopies' entries.
-   **Fix:** `services/canopyListingGate.ts`. The API reads the room's state
    through the Synapse admin API (`matrixClient.getRoomStateAdmin`; the bot
    token holds admin rights, `adminPreflight` in `src/index.ts`) and maps the
    caller to their Matrix id (`matrixUserIdFor`). The caller must be joined,
    and their level (`users[mxid] ?? users_default ?? 0`) must reach the level
    needed to change `m.room.power_levels`
    (`events['m.room.power_levels'] ?? state_default ?? 50`), read with the
    bot-posting gate's parsing (now exported from `services/botPostingGate.ts`);
    then the room must be a space (`m.room.create` content `type: m.space`).
    Membership and power are checked first, so a caller who is not an admin
    learns only "not an admin", the answer an unknown room id gets. It fails
    closed. The same check runs for an existing entry, so only the canopy's
    admin can change it.

    | Refusal                    | Status | When                                                                                                                                                     |
    | -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `not_canopy_admin`         | 403    | unknown room (404), caller not joined, or level below the power-levels level                                                                             |
    | `not_a_space`              | 409    | the caller administers the room, but it is not a space                                                                                                   |
    | `account_unknown`          | 401    | the token's account no longer exists, so there is no Matrix id                                                                                           |
    | `matrix_not_configured`    | 503    | no homeserver or bot token configured                                                                                                                    |
    | `canopy_check_unavailable` | 503    | the state could not be read (network, any other homeserver error, bad body), or has no power-levels or create event, or a needed level is not an integer |

-   **Test:** `test/canopy-directory.integration.test.ts`: L-1 (the creator
    lists, and the stub records the state read), L-2 (a member at 50, a
    stranger and an account that left with its 100 are refused), L-3 (unknown
    room), L-4 (not a space, and a stranger is told only "not an admin"), L-5
    (another account cannot rename an entry; its admin can), L-6 (the
    fallbacks: `state_default`, then 50; `users_default`, then 0; integer
    strings), L-7 (homeserver error, unreachable homeserver, no power-levels
    event, a non-integer level, no create event, no bot token, a deleted
    account: each refused with its code, nothing listed). The directory's
    existing round-trip and app-install tests now list through the check.
-   **Notes:** levels follow room versions 1 to 11, all the fork knows
    (`synapse/api/room_versions.py`); in room version 12 a creator has no
    `users` entry and would be refused, which fails closed. The join rule is
    not checked (O2).

## H5 — the New canopy form hid a failed listing — fixed

-   **Found:** `CreateSpace.tsx` calls `indexCanopy` without waiting and
    dropped any failure (`.catch(() => undefined)`), while the form says "A
    public canopy is listed in the Blackout directory". After H4 a listing can
    also be refused when the API cannot check the canopy on the homeserver
    (no bot token, homeserver down).
-   **Fix:** a failed listing shows a toast: the canopy was created but could
    not be listed, and voice rooms and app installs need the listing. Creation
    is unchanged; the creator holds the top power level, so the normal path
    lists as before. `discoveryClient.ts` still sends the header, which now
    only narrows the request to `discovery.write`; its comment says so.
-   **Test:** `CreateSpace.test.tsx`, "a listing that fails is reported in a
    toast; the canopy is still created" (a Critical toast naming the canopy;
    `onCreate` still called), and the listing test checks no toast is shown
    when the listing succeeds.

---

## Inventory: every capability-checked write, and what changes

Every `requireDomainCapability` call in `packages/api/src/modules/*.ts` was
read; `canAccessDomain` is the only session-capability check in the API
(`x-blackout-entitlement-payload` on `GET /v1/entitlements/*` is echoed back to
unauthenticated callers and grants nothing). Reads: every `<domain>.read` is
minted except `channels.read`; none changes.

| Scope (after)                                            | Routes                                                                                                                                                                       | Ownership / membership check                                                                                                                                                                              | Shipped caller                                                                                                                                          | What changes for it                                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `streaming.write`, minted (unchanged)                    | stream key, stream state, metadata and access, sessions, clips, extensions, stream moderation, revenue (`modules/streaming.ts`)                                              | every route: `creatorId === sub`, `assertSelfCreator` or `requireStreamOwner`                                                                                                                             | web client streaming and creator pages                                                                                                                  | none                                                                                                                                                        |
| `profile.write`, minted (unchanged)                      | `PUT /v1/profile/:userId`, `POST /v1/profile/:userId/wall`                                                                                                                   | `subjectOwnsProfile`; a wall post's author is the caller and the owner's audience setting applies                                                                                                         | web client profile                                                                                                                                      | none                                                                                                                                                        |
| `stego.write`, minted (new)                              | `POST /v1/stego/channels`, `POST /v1/stego/channels/:id/rotate`, `DELETE /v1/stego/channels/:id`                                                                             | one bucket per account                                                                                                                                                                                    | web client Stego Toolkit and Lifecycle pages (flag `stegoToolkit`, off by default; their client gates name `stego.toolkit.use`, which no token carries) | create, rotate and expire were refused (403) and are accepted                                                                                               |
| `deaddrop.write`, admin only                             | `POST /v1/deaddrop`, `POST /v1/deaddrop/open`                                                                                                                                | open: only the addressed recipient; create: the sender is the caller, but any account can be named as the recipient, with no check on its side (O6)                                                       | none: the SDK's dead-drop actions call `/send`, `/fetch`, `/share` and `/audit`, which the API does not serve                                           | none                                                                                                                                                        |
| `discovery.write`, minted (new)                          | `POST /v1/discovery/index/canopies`                                                                                                                                          | new: the caller is the canopy's admin on the homeserver (H4)                                                                                                                                              | web client New canopy form, through `indexCanopy`                                                                                                       | lists as before for the creator; refused with a code otherwise, and the form says so (H5)                                                                   |
| `discovery.write` and admin (new)                        | `POST /v1/discovery/index/profiles`, `/index/activity`, `/index/jobs/full`, `/index/jobs/incremental`, `/analytics/events`                                                   | none, so an allowlisted admin is required                                                                                                                                                                 | none                                                                                                                                                    | none                                                                                                                                                        |
| `governance.write`, admin only                           | `POST /proposals`, `POST /votes`, `POST /proposals/:id/resolve`, `PUT` and `DELETE /meetings/:id`, `POST /treasury/snapshot`, `POST /treasury/milestones` (`/v1/governance`) | proposer and voter are the caller (one ballot each), but no community membership or role; resolve, meetings and treasury have no check at all                                                             | Expo governance tab (sends the header); web client governance meetings and treasury writes (bearer token only)                                          | Expo tab: creating a proposal and voting are refused (were accepted); its reads are unchanged. Web: refused before and after, except for allowlisted admins |
| `moderation.write`, admin only                           | `POST /v1/moderation/actions`; Mjolnir: subscribe and unsubscribe, add and remove rule, set protection (`/v1/moderation/mjolnir`)                                            | actions: none (no community role); Mjolnir: per-account state (O3)                                                                                                                                        | web client Mjolnir settings (bearer token only)                                                                                                         | refused before and after, except for allowlisted admins                                                                                                     |
| `forum.write`, admin only                                | `POST /v1/forum/posts`                                                                                                                                                       | author is the caller; no community membership                                                                                                                                                             | none (the SDK's `createForumActions` has no caller in the apps)                                                                                         | none                                                                                                                                                        |
| `channels.read` and `.write`, admin only                 | `GET /v1/channels`, `POST /v1/channels`                                                                                                                                      | none; the list returns every community's channels, private ones included                                                                                                                                  | none                                                                                                                                                    | none                                                                                                                                                        |
| `growth.write`, admin only                               | `POST /referrals`, `/ambassadors/apply`, `/quests`, `/quests/:id/end`, `/quests/:id/complete`, `/migration-credits`, `/migration-credits/:id/redeem` (`/v1/growth`)          | mixed: quest create and end and credit redeem are owner-checked (O3); issuing a migration credit lets the caller issue itself any value; a referral claims another account; a completion claims any quest | web client growth pages (bearer token only)                                                                                                             | refused before and after, except for allowlisted admins                                                                                                     |
| `deadman.write`, nobody (every session since 2026-10-26) | `POST /switches`, `/switches/:id/check-in`, `/switches/:id/cancel`, `/process-overdue` (`/v1/deadman`; the last removed 2026-10-26)                                          | owner-scoped                                                                                                                                                                                              | web client dead-man panel (bearer token only)                                                                                                           | refused before and after (N2); since 2026-10-26 check-in and cancel work, and `POST /switches` answers 409 `arming_unavailable`                             |

The desktop (Tauri) and mobile (Capacitor) apps ship the web client's build
(`apps/blackout-client/dist`), so the web client rows cover them too.

**The Expo governance tab** (`packages/mobile`, a bare scaffold) can still list
proposals from the event feed and show each proposal's tally. Creating a
proposal and voting now fail with 403 `missing_capability`, which the tab shows
as the response text, unless the account is on the admin allowlist. The tab is
unchanged.

---

## Open

-   **O1 — a community role model.** Governance, moderation, forum, channels
    and growth writes stay admin-only until the API can tell a community's
    members and moderators from anyone else; the plan is to derive roles from
    Matrix power levels, as the listing check does for one canopy, and as
    voice rooms now do (O4). Until then a community cannot govern or moderate
    itself through the API.
-   **O2 — the join rule on listing.** A canopy's admin can list a canopy that
    is not public (`KNOWN_LIMITATIONS.md`, "New canopy and den defaults"). A
    server-side check of the join rule is a recorded follow-up, not part of
    this change.
-   **O3 — scopes that mix route kinds.** The Mjolnir routes keep per-account
    state, and quest create and end and credit redeem are owner-checked, but
    they share `moderation.write` and `growth.write` with routes that are not.
    They are admin-only as a result. No shipped client could use them before
    (no token carried the scope and the web client does not send the header),
    so nothing that worked stops working. Splitting the scopes is a follow-up.
-   **O4 — voice-room roles from the request — fixed 2026-10-24** (last
    section). Found while reading the `hasCanopy` callers: `routes/voice.ts`
    took `role` (`admin`, `moderator`) from the request body, and that role
    decided who may create a voice room, take moderation actions in one, and
    join one that is locked. It was not a capability check and was not changed
    with H1 to H5; it needed the role model of O1, and now has one for voice
    rooms: the caller's power level in the canopy on the homeserver.
-   **O5 — tokens minted before the change.** A session token carries the
    capability list of the moment it was signed, for up to 24 hours. Until it
    expires or is refreshed, such a token does not carry `discovery.write` or
    `stego.write`, so listing a new canopy is refused (403
    `missing_capability`; H5 makes that visible) and the stego writes stay
    refused.
-   **O6 — dead-drop writes.** The open route is bound to the addressed
    recipient, but creating a drop names any account as its recipient with no
    check on that account's side, and the drop (id, channel, time) then
    appears in the recipient's account export (`exportUserData` in
    `services/accountLifecycle.ts`). An existing test already held that tokens
    must not carry `deaddrop.write`
    (`test/streaming-capabilities.integration.test.ts`). It stays unminted and
    admin-only; no shipped client calls these routes. Minting it needs a
    recipient-side rule, or a decision that addressing a drop to anyone is
    acceptable.
-   **Not changed:** `GET /v1/moderation/actions?communityId=` still returns a
    community's actions to every token (FEED-6 in
    [`deadman-and-feeds-triage-2026-10-12.md`](deadman-and-feeds-triage-2026-10-12.md));
    `deadman.write` stayed unminted (N2) until 2026-10-26, when the dead-man
    release design's PR 1 minted it (D4 closed). The launch-smoke suite's
    `registerCanopy` helper sent no capability and was refused before this
    change too; LS-CALL-01 passed because joining a voice room did not look at
    the directory. (Since 2026-10-24 joining needs an existing room, V1, so
    LS-CALL-01 seeds one and the helper is gone.)

## Still unverified

-   The admin room-state endpoint on a running fork. The check relies on it,
    as the bot-posting gate does; the fork serves it
    (`synapse/rest/admin/rooms.py`, `RoomStateRestServlet`: 404 for an unknown
    room, otherwise `{ state }`), but the fork was not run for this change.
-   The toast in a real browser: it is tested in jsdom only.

## Documentation corrected with this record

-   `KNOWN_LIMITATIONS.md`: "New canopy and den defaults" (who can list) and a
    new entry for the admin-only writes, with what the Expo governance tab can
    no longer do.
-   `TRUST.md` (and the generated `trust.html`),
    `docs/black-mask-chat-panel-and-account-link.md`, and the comment in
    `apps/blackout-client/src/app/components/create-room/newRoomDefaults.ts`:
    the directory accepts a listing from the canopy's admins, not from any
    signed-in account.
-   `THREAT_MODEL.md`: adversary A6.
-   `docs/launch-smoke-suite.md`: LS-MOD-01, LS-GOV-01 and LS-GOV-02 need
    accounts on the admin allowlist.
-   Comments: `modules/authz.ts`, `deriveUserCapabilities` and
    `adminAllowlist` in `services/auth.ts`, `routes/admin.ts`,
    `routes/coalitions.ts`, `discoveryClient.ts`.

---

## 2026-10-24: O4 fixed — voice-room roles come from the homeserver

The operator approved fixing O4 on 2026-10-24. **Read**, **Run** and **Test**
as above; the tests are `packages/api/test/voice-roles.integration.test.ts`
(V-1 to V-11), against the stub homeserver.

### What the role decided

`routes/voice.ts` took the role from the request body (`roleFromRequest`:
`admin` or `moderator` if the body said so, else `member`). What the claim
unlocked:

| Route                                                | `member`                               | `moderator` or `admin`, claimed                                       |
| ---------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `POST /rooms/create`                                 | 403                                    | a room in any listed canopy (the premium subscription still required) |
| `POST /rooms/join`                                   | an unlocked room; 423 for a locked one | a locked one too, with publish and subscribe forced on                |
| `POST /token`                                        | a token for an unlocked room           | for a locked one too                                                  |
| `POST /rooms/moderation/lock`, `mute`, `remove`      | 403                                    | in any room                                                           |
| LiveKit token `metadata`, participant row, event log | `member`                               | the claimed role, which the other participants see                    |

-   **Verified:** read. No shipped caller sends `role` or calls these routes.
    The web client's only `/v1/voice` call is `GET /rooms/open`
    (`features/circle-feed/OpenVoiceRooms.tsx`); its calls go through MatrixRTC
    and lk-jwt-service (`features/call/`); the desktop and mobile shells ship
    that client; the SDK, the Expo app and `legacy/` make no voice calls. The
    `packages/web` voice panel that sent `role` (`ef5449e`) is no longer in the
    tree. The only senders left were API tests, all with `role: member`.

### Which room: the canopy

`canopyId` is the canopy's Matrix room id: the space the New canopy form lists
(`CreateSpace.tsx` passes the new room's id), the id the listing check reads
(H4), and what `/rooms/create` requires to be listed. `channelId` is a label:
nothing in the API resolves it to a room or checks that it is in the canopy,
the tests use `main` and `chan-1`, and the open-rooms list shows it as the
room's name. The old refusals said "canopy admins/mods". So the role is the
caller's standing in the canopy. A den's own power levels would be a finer
source, but the API has no den id to read.

### The rule

`services/voiceRoleGate.ts` reads the canopy's current state through the
Synapse admin API (`getRoomStateAdmin`), as the listing check does, with the
same readers (`membershipOf`, `powerLevelsContent`, `userPowerLevel`,
`requiredPowerLevel`, and `namedPowerLevel`, added beside them in
`botPostingGate.ts`). The caller's level is `users[mxid] ?? users_default ?? 0`.

| Role        | Rule                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`     | joined, and the level reaches `events['m.room.power_levels'] ?? state_default ?? 50`: the listing check's definition of a canopy admin                                  |
| `moderator` | joined, and the level reaches `kick ?? 50`                                                                                                                              |
| `member`    | anyone else: not joined (left, invited, banned, never there) whatever level they kept, below both levels, or a room the homeserver does not know (404, the same answer) |

**Why `kick` for a moderator.** The power-levels event names a level for each
power over other members: `kick` (make a member leave, default 50), `ban`
(make them leave and keep them out, default 50), `redact` (remove someone
else's event, default 50) and `invite` (default 0). `state_default`
(default 50) is the fallback for state events that `events` does not list,
and `events_default` (default 0) for messages. The voice powers are removing a
participant, muting one, locking the room to new joins, entering a locked
room and creating one. Removing is a kick; muting is a lesser sanction on the
same person; locking removes nobody and lifts on unlock; entering and creating
are what running a room takes. `kick` is the field a canopy's admins set to
say who may remove people, and the fork's own kick check is the same
comparison (`synapse/event_auth.py`: `user_level < kick_level` refuses).
`ban` would key the role to keeping a person out, which no voice action does.
`state_default` describes no power over members, and the fork's default power
levels list the settings that matter in `events` explicitly
(`m.room.power_levels`, `m.room.history_visibility`, `m.room.encryption` at
100; `m.room.name`, `m.room.avatar`, `m.room.canonical_alias` at 50:
`synapse/handlers/room.py`), so it mostly governs types nobody listed. A
canopy made with the New canopy form keeps the fork's defaults (the form
overrides only `events_default`, to 50): `kick`, `ban`, `redact` and
`state_default` are all 50 and the creator has 100, so the choice changes
nothing there. It matters only where a canopy's admins changed `kick`, and
then it follows them.

`admin` is checked first: a level that reaches the power-levels level is
`admin` even where `kick` is higher (an odd room), and both may moderate.

**It fails closed.** When the gate cannot tell, nobody gets an elevated role:

| Refusal                    | Status | When                                                                                                                                                                                         |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not_canopy_moderator`     | 403    | creating or moderating as a `member`                                                                                                                                                         |
| `account_unknown`          | 401    | the token's account no longer exists, so there is no Matrix id                                                                                                                               |
| `matrix_not_configured`    | 503    | no homeserver or bot token                                                                                                                                                                   |
| `canopy_check_unavailable` | 503    | the state could not be read (network, any homeserver error but 404, a bad body), or the caller is joined but the room has no power-levels event, or a level the rule needs is not an integer |

Create and moderation answer with the refusal. Join and token still serve a
member: into an unlocked room they go ahead as `member`, so an ordinary join
does not depend on the homeserver (LS-CALL-01 runs with none configured); a
locked room answers the refusal instead of 423, so a moderator is not told the
room is simply locked. If `MATRIX_HOMESERVER_DOMAIN` differs from Synapse's
`server_name`, no caller is found joined and nobody is a moderator, which also
fails closed.

**A `role` in the request is ignored, not refused.** The schemas no longer
name it and zod drops unknown keys (zod 4.6.6; run), so no code can read it.
Refusing it would add nothing, since it grants nothing either way, and would
break a client that sends a harmless `role: member`. The join response
already reports the role the caller got (`permissions.role`; the LiveKit
token's `metadata` carries the same).

### V1 — joining created rooms — fixed

-   **Found:** `/rooms/join` called `createOrUpdateVoiceRoom` for whatever
    canopy and channel it was given, with no directory or role check, so any
    entitled account could start a room in any canopy, listed or not, and the
    create route's role check bounded nothing. `KNOWN_LIMITATIONS.md` said the
    API gates voice rooms on the directory entry; joining did not. Nothing ever
    ends a room (no code sets `active: false`), so each one stayed in
    `/rooms/open`, created by whoever joined first.
-   **Fix:** join and token answer 404 `room_not_found` for a room nobody
    created, before asking the homeserver; only `/rooms/create` (a listed
    canopy, the subscription, a moderator) makes one. Join still refreshes the
    room's `updatedAt`, which the OBS mute path uses to pick a creator's current
    room. Both read the room again after the homeserver answers, so a room
    locked meanwhile still refuses a member.
-   **Test:** V-8, V-9.

### What changes for callers

| Route                               | Before                                                                      | After                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| create                              | any entitled account claiming a role, in any listed canopy                  | the canopy's moderators and admins on the homeserver                          |
| join                                | any entitled account; joining created the room; a claim entered locked ones | an existing room only; a locked one admits the canopy's moderators and admins |
| token                               | any account; a claim entered locked rooms                                   | any account, for an existing room; a locked one admits moderators and admins  |
| moderation                          | any account claiming a role                                                 | the canopy's moderators and admins                                            |
| role in the token, the row, the log | the claim                                                                   | the homeserver's answer at that request                                       |

No shipped client changes: none sends `role` or calls these routes. The tests
that sent `role: member` (LS-CALL-01, LS-CALL-03, the v1-routes join test) no
longer do, and the two join tests join a room seeded as `/rooms/create` leaves
it (neither file stubs a homeserver) instead of relying on join to create it.

-   **Test:** V-1 (the admin and a moderator create; the API asked the
    homeserver), V-2 (each role at join; publish and subscribe forced for
    moderators only), V-3 (a member cannot create, lock, mute, remove or enter
    a locked room; a moderator and the admin can), V-4 (a stranger, and
    accounts that left, are invited or are banned with 100 kept, are members),
    V-5 (a body claiming `admin` or `moderator` gets nothing on any route and
    is not refused; one claiming `member` does not demote the admin), V-6 (the
    thresholds and their fallbacks; integer strings), V-7 (each failure mode,
    for the admin at 100: create, lock, a locked join and a locked token
    refused with the code; an unlocked join goes ahead as `member`), V-8, V-9.
-   **Mutation check (run):** each key line of the gate and the routes was
    removed or weakened in turn, and all 36 mutations fail at least one of V-1
    to V-9. In the gate: the account, no-bot-token, 404, failed-read,
    membership and missing-power-levels checks, each of the three non-integer
    checks, the admin and moderator branches, `>` for `>=` in each, the
    moderator level taken from `ban`, from `state_default` or with a default
    of 0, the admin level ignoring the `events` entry, and `namedPowerLevel`
    ignoring the room's value. In the routes: each refusal on create and
    moderation, each lock check, each room-exists check, join creating rooms
    again, the lock read before the homeserver call (join and token), a failed
    check giving `admin`, a locked room answering 423 when the check failed,
    `canModerate` dropping moderators, and the body's `role` honoured again on
    create, join, token or moderation.

### Found while fixing O4

-   **V2 — the event feed had no sign-in check — fixed for anonymous
    callers.** `GET /v1/voice/rooms/:canopyId/:channelId/events` answered
    anyone who could reach the API (run: 200 with no token) with a room's
    participants (Blackout user ids, roles, join times) and its join, leave and
    moderation history. It now requires a signed-in caller, as every other
    voice route does (V-10; removing the check fails it). Open: any
    signed-in account can still read any room's feed, a locked room's
    included. Moderators only would follow the role model; no shipped client
    reads it.
-   **V3 — an unknown moderation action logged a removal — fixed.**
    `/rooms/moderation/<anything but lock, mute or remove>` with a target
    answered 200 and logged a `remove` that removed nobody (run, with `kick`).
    It now answers 404 `unknown_action` before reading the body or asking the
    homeserver (V-11; removing the check, or dropping `mute` from the allowed
    actions, fails a test).
-   **V4 — moderation does not reach LiveKit — open.** `mute` only records the
    action, and `remove` only ends the participant's row in the API; neither
    calls LiveKit, so the person stays connected and can still speak. `lock`
    refuses new joins and tokens, but a LiveKit token already issued stays
    valid until it expires (5 minutes by default, at most 15:
    `services/livekit.ts`), with the role it was minted with. Real moderation
    needs LiveKit's room service (`removeParticipant`, `mutePublishedTrack`;
    `services/livekitAdmin.ts` already holds a client for the OBS mute path).
    Stated in `KNOWN_LIMITATIONS.md`.
-   **V5 — the token route skips the subscription check — open.** Joining
    requires the premium canopy subscription; `POST /v1/voice/token` does not,
    so any signed-in account gets a token for an existing unlocked room. A
    billing rule, not a role, so it is the operator's call.
-   **V6 — unlocked rooms are drop-in — unchanged.** Any signed-in, entitled
    account can join an unlocked room, member of the canopy or not, including
    one the canopy banned (V-4), and `/rooms/open` lists every unlocked room
    with its canopy id to every signed-in account. That is the drop-in design
    (the comment on `/rooms/open`), and ordinary joins keep working, as asked.
    Refusing banned accounts would be a membership rule rather than a role, and
    a new account gets around it; locking the room is the control that holds.
-   **V7 — moderation does not compare levels — open, low.** A Matrix kick also
    needs the kicker's level above the target's; voice mute and remove compare
    nothing, so a moderator can mute or remove the canopy's admin. Low while V4
    stands, since neither touches the call; worth mirroring when moderation
    reaches LiveKit.
-   **Not changed:** rooms that joining created before this change stay (rooms
    never end), including any for an unlisted canopy or a made-up id; they can
    still be joined, and moderating one takes a role in the room its
    `canopyId` names. The gate does not check that the canopy is a space: new
    rooms need a listed canopy, and listing requires one.

### Still unverified

-   The check against a running fork: as for H4, the admin room-state endpoint
    is read (`RoomStateRestServlet`), not run; the tests use the stub.
-   Room version 12: a creator has no `users` entry there and would be read as
    `member`, which fails closed. The fork knows room versions 1 to 11.
-   Cost: each create, join, token and moderation request reads the canopy's
    whole state, member events included. Not measured for large canopies.
-   A role changed on the homeserver applies from the caller's next request;
    a LiveKit token already issued keeps its role until it expires (V4).

### Documentation corrected with this section

-   `KNOWN_LIMITATIONS.md`: a new entry, "Voice rooms in the API".
-   `THREAT_MODEL.md`: adversary A6.
-   `packages/api/README.md`: the voice routes, who may use them, and what
    moderation does.
-   `TRUST.md` and `trust.html`: unchanged; they make no claim about voice
    rooms or their moderation.
