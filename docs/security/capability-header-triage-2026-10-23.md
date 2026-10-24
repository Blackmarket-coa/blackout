# Session capabilities and the `x-blackout-capabilities` header — triage, 2026-10-23

The API's per-domain scopes (`governance.write`, `moderation.write`, ...) were
granted by the union of the session token's `capabilities` claim and whatever
the caller listed in the `x-blackout-capabilities` request header. Only
`admin.*` and `*` were refused from the header, so any signed-in account could
grant itself every other scope by naming it. This record covers the fix the
operator decided on (a staged one), the inventory it was built from, and what
is still open. Every finding gets a fix or a written reason, per the standing
rule in this directory.

Written against `develop` at `291f593`, with the change set that fixes it.
**Read** below means the claim rests on the code; **Test** names the
regression test that drives the real Hono app (in memory mode, against the stub
homeserver in `packages/api/test/_fixtures/matrixStub.ts` where a homeserver is
involved), so CI's `api-smoke-and-integration` job keeps this record honest.

**Result:** H1 to H5 fixed. Open: the community role model (O1), the join
rule on listing (O2), scopes that mix owner-checked and shared-state routes
(O3), voice-room roles taken from the request (O4), the rollout window for
tokens minted before the change (O5), and whether dead-drop writes can be
minted (O6).

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
| O4  | Voice-room roles (`admin`, `moderator`) are taken from the request body                                 | Read        | Open: needs the same role model; not a capability check        |
| O5  | Tokens minted before the change keep the old capability list until they expire or are refreshed         | Read        | Open, transitional                                             |
| O6  | A dead drop can be addressed to any account, and appears in that account's export                       | Read        | Open: admin-only until decided                                 |

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
    `deaddrop.write` (O6).
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

| Scope (after)                            | Routes                                                                                                                                                                       | Ownership / membership check                                                                                                                                                                              | Shipped caller                                                                                                                                          | What changes for it                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `streaming.write`, minted (unchanged)    | stream key, stream state, metadata and access, sessions, clips, extensions, stream moderation, revenue (`modules/streaming.ts`)                                              | every route: `creatorId === sub`, `assertSelfCreator` or `requireStreamOwner`                                                                                                                             | web client streaming and creator pages                                                                                                                  | none                                                                                                                                                        |
| `profile.write`, minted (unchanged)      | `PUT /v1/profile/:userId`, `POST /v1/profile/:userId/wall`                                                                                                                   | `subjectOwnsProfile`; a wall post's author is the caller and the owner's audience setting applies                                                                                                         | web client profile                                                                                                                                      | none                                                                                                                                                        |
| `stego.write`, minted (new)              | `POST /v1/stego/channels`, `POST /v1/stego/channels/:id/rotate`, `DELETE /v1/stego/channels/:id`                                                                             | one bucket per account                                                                                                                                                                                    | web client Stego Toolkit and Lifecycle pages (flag `stegoToolkit`, off by default; their client gates name `stego.toolkit.use`, which no token carries) | create, rotate and expire were refused (403) and are accepted                                                                                               |
| `deaddrop.write`, admin only             | `POST /v1/deaddrop`, `POST /v1/deaddrop/open`                                                                                                                                | open: only the addressed recipient; create: the sender is the caller, but any account can be named as the recipient, with no check on its side (O6)                                                       | none: the SDK's dead-drop actions call `/send`, `/fetch`, `/share` and `/audit`, which the API does not serve                                           | none                                                                                                                                                        |
| `discovery.write`, minted (new)          | `POST /v1/discovery/index/canopies`                                                                                                                                          | new: the caller is the canopy's admin on the homeserver (H4)                                                                                                                                              | web client New canopy form, through `indexCanopy`                                                                                                       | lists as before for the creator; refused with a code otherwise, and the form says so (H5)                                                                   |
| `discovery.write` and admin (new)        | `POST /v1/discovery/index/profiles`, `/index/activity`, `/index/jobs/full`, `/index/jobs/incremental`, `/analytics/events`                                                   | none, so an allowlisted admin is required                                                                                                                                                                 | none                                                                                                                                                    | none                                                                                                                                                        |
| `governance.write`, admin only           | `POST /proposals`, `POST /votes`, `POST /proposals/:id/resolve`, `PUT` and `DELETE /meetings/:id`, `POST /treasury/snapshot`, `POST /treasury/milestones` (`/v1/governance`) | proposer and voter are the caller (one ballot each), but no community membership or role; resolve, meetings and treasury have no check at all                                                             | Expo governance tab (sends the header); web client governance meetings and treasury writes (bearer token only)                                          | Expo tab: creating a proposal and voting are refused (were accepted); its reads are unchanged. Web: refused before and after, except for allowlisted admins |
| `moderation.write`, admin only           | `POST /v1/moderation/actions`; Mjolnir: subscribe and unsubscribe, add and remove rule, set protection (`/v1/moderation/mjolnir`)                                            | actions: none (no community role); Mjolnir: per-account state (O3)                                                                                                                                        | web client Mjolnir settings (bearer token only)                                                                                                         | refused before and after, except for allowlisted admins                                                                                                     |
| `forum.write`, admin only                | `POST /v1/forum/posts`                                                                                                                                                       | author is the caller; no community membership                                                                                                                                                             | none (the SDK's `createForumActions` has no caller in the apps)                                                                                         | none                                                                                                                                                        |
| `channels.read` and `.write`, admin only | `GET /v1/channels`, `POST /v1/channels`                                                                                                                                      | none; the list returns every community's channels, private ones included                                                                                                                                  | none                                                                                                                                                    | none                                                                                                                                                        |
| `growth.write`, admin only               | `POST /referrals`, `/ambassadors/apply`, `/quests`, `/quests/:id/end`, `/quests/:id/complete`, `/migration-credits`, `/migration-credits/:id/redeem` (`/v1/growth`)          | mixed: quest create and end and credit redeem are owner-checked (O3); issuing a migration credit lets the caller issue itself any value; a referral claims another account; a completion claims any quest | web client growth pages (bearer token only)                                                                                                             | refused before and after, except for allowlisted admins                                                                                                     |
| `deadman.write`, nobody                  | `POST /switches`, `/switches/:id/check-in`, `/switches/:id/cancel`, `/process-overdue` (`/v1/deadman`)                                                                       | owner-scoped                                                                                                                                                                                              | web client dead-man panel (bearer token only)                                                                                                           | refused before and after (N2)                                                                                                                               |

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
    Matrix power levels, as the listing check does for one canopy. Until then
    a community cannot govern or moderate itself through the API.
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
-   **O4 — voice-room roles from the request.** Found while reading the
    `hasCanopy` callers: `routes/voice.ts` takes `role` (`admin`, `moderator`)
    from the request body, and that role decides who may create a voice room,
    take moderation actions in one, and join one that is locked. It is not a
    capability check and is not changed here; it needs the role model of O1.
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
    `deadman.write` stays unminted (N2). The launch-smoke suite's
    `registerCanopy` helper sends no capability and was refused before this
    change too; LS-CALL-01 passes because joining a voice room does not look at
    the directory.

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
