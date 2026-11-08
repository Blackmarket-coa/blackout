# Account creation on an existing homeserver name — triage, 2026-10-26

Run date: 2026-10-26, against `develop` at `3c3c05c`. Written with the fix that
closes it, in the same change set.

The standing rule applies: every finding gets a fix or a written explanation,
and nothing is baselined silently. This record is deliberately neutral: it
states what was wrong, what the fix does, and what the fix cannot fully close,
without a reproduction recipe.

## The finding

`POST /v1/auth/register` provisions the Matrix account through the admin API
(`matrixClient.registerUser` → `PUT /_synapse/admin/v2/users/{mxid}`). That
admin endpoint both creates an account and updates one that already has the id;
an update resets the account's password and, by default, logs its other devices
out. The route chose the account id from the caller-supplied `username` and
checked only for an existing **Blackout** row, not an existing **Matrix**
account. A Matrix account can exist without a Blackout row — the two id spaces
are separate — so a registration naming such an account would write to it
instead of being refused. The `PUT` with no lookup has been in `registerUser`
since `registerUser`'s first commit on `develop` (`9713cfd181`, 2026-03-23 UTC),
and `/register` has called it since that same commit (served at
`/api/auth/register`, and from `77c27bd253`, 2026-04-05 UTC, also at
`/v1/auth/register`; "Disclosure" says which later processes still serve the
`/api` path). Until `bcdbb5c7db` (2026-05-21 UTC), though, `registerUser` wrote
every account id with the domain `blackout.local`, and Synapse's admin `PUT`
refuses an id that is not local to the homeserver (`400`, "This endpoint can
only be used with local users"), so those builds wrote nothing on a homeserver
of any other name.
`bcdbb5c7db` takes the domain from `MATRIX_HOMESERVER_DOMAIN` (default
`blackout.local`). The builds affected are therefore: on a homeserver whose
`server_name` is `blackout.local` (the API's development default), every build
from `9713cfd181` to the merge of this fix; on any other homeserver (the
repository's homeserver template names `theblackout.app`), every build from
`bcdbb5c7db` to the merge of this fix, wherever `MATRIX_HOMESERVER_DOMAIN` is
set to that homeserver's name, which account creation there needs.

A second gap sat next to it: under `REQUIRE_INVITE_TOKEN=1` the route created
the Matrix account before it consumed the invitation, so a token that was not
usable left the Matrix account behind even though the request was refused.

Severity is critical. The first gap let anyone, with no session, act on an
account that was not theirs: any homeserver account with no Blackout `users` row
of that username. That covers the accounts created directly on the homeserver,
among them its admin accounts and the bot account the API itself uses, which
must be a server admin; and burner accounts (`@burn-…`) and accounts registered
on the homeserver itself (the web client's Register tab, where the homeserver
allows registration) or through account-number sign-up, until `/matrix/exchange`
provisions a row for them, which it does only with
`BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS` set (off by default). Burner sign-up
itself creates no `users` row, only the burner record. A registration naming one
of those set its password to the one the caller sent and signed out its
sessions. The second gap broke the invite gate, which is meant to be a hard
precondition for any account coming into being.

## The fix

**Create-only account provisioning.** `matrixClient.registerUser` now looks the
account up first (`GET /_synapse/admin/v2/users/{mxid}`): only a `404` goes on
to the `PUT`, a `200` is refused (`matrix_user_exists`), and any other lookup
answer fails closed. The `PUT` is accepted only when it returns `201`
(created); a `200` (the admin API's "modified an existing account") is refused
too. `provisionBurner` carries the same guard. The burner and account-number
paths choose server-derived names, so only `/register` ever fed a
caller-chosen name to this endpoint; the guard is applied to all of them for
consistency. Their accounts were still among the ones `/register` could name
(above).

**The route.** `/v1/auth/register` maps the refusal to `409 user_exists` and
rolls the local row back. That is the same answer a local username clash already
gives, so the response does not tell a caller whether the name belongs to a
Blackout account or only to a homeserver account. It does say that the name is
taken, as the homeserver's own availability check
(`GET /_matrix/client/v3/register/available`) does where the homeserver allows
registration; with the invite gate on, a `409` does not consume the token, which
is previewed but not redeemed, so one usable token can be presented with any
number of taken names. A presented invite token is checked (`previewInvitation`)
before the local row or the Matrix account is created, and consumed after; with
the gate on, an unusable or absent token now creates nothing.

The only other admin endpoint that can create an account,
`POST /_synapse/admin/v1/register` (the shared-secret nonce flow), is not used
by the API, which is not given the homeserver's registration shared secret.
Outside the API, the repository's operations tooling uses it
(`infra/single-server-baseline/synapse/verify-launch.sh`, and Synapse's own
`register_new_matrix_user`, which the runbooks have operators run to create
accounts), as do two optional services in
`deploy/docker/blackout-backend/docker-compose.yml` that are given the secret:
`matrix-registration`, a token-gated sign-up page, and maubot, for its bot
accounts. None of them takes a name from an API caller, and that endpoint only
creates: it refuses a name the homeserver already has.

## What an operator should check

Copy the homeserver's log, which holds its access lines, off the server now,
before the fix is deployed and before rotation discards more of it. It is the
only evidence that covers every account, and it does so only for the period it
still reaches; every day it is left in place can take a day of that period with
it.

Whether the first gap was used before the fix is deployed can be read for every
account from the homeserver's access log, but only for the period that log
still covers, and the affected code has been on `develop` since March 2026, and
able to write to an account on a homeserver not named `blackout.local` since
May 2026 (above). For any earlier period nothing covers every account. Some
evidence can clear one account at a time: a device or access token that the
account had before the period and still has, or a password hash unchanged from
a database backup taken before the period. Two traces in room timelines and one
cross-check on the API side can find an account written to, but none of them
can clear one. The API recorded nothing that marks such a request on its own:
each registration row is ordinary by itself.

-   **Synapse's access log.** Every account the API created is a
    `PUT /_synapse/admin/v2/users/…` made with the bot's token. A new account
    answers `201`; a `200` means an existing account was modified. Look at the
    admin accounts (`users.admin = 1` in Synapse's database) and the bot
    account first. A `200` that follows a `201` for the same id can have an
    ordinary cause: before the fix, a registration that the invite check
    refused still left the account it had just created, so the same person
    retrying under the same name got a `200` on that account. The log does not
    show who sent either request, so it cannot tell such a retry from a second
    caller.

    The log reaches back only as far as the server keeps it. The homeserver
    template (`infra/single-server-baseline/synapse/homeserver.yaml.template`)
    points `log_config` at a file on the server that the repository does not
    hold. Three defaults keep a bounded amount. The logging configuration
    Synapse generates rotates its file at midnight and keeps 3 earlier files.
    The Synapse Docker image's template, which the image's `generate` step
    writes to `/data/<server name>.log.config`, keeps 6 when it writes a file
    and otherwise logs to the console only. And
    `infra/single-server-baseline/docker-compose.yml` keeps the last 50 MB of
    each container's console output (`max-size: '10m'`, `max-file: '5'`).
    With these, unless the server was set to keep more, or the log is shipped
    elsewhere, expect it to reach back days or weeks, not to May 2026. A
    container that logs to the console with no log options can reach back
    further. `deploy/docker/blackout-backend/docker-compose.yml` runs Synapse
    that way: it sets no log options, and its homeserver template points
    `log_config` at `/data/${MATRIX_SERVER_NAME}.log.config`, the name under
    which the image's `generate` step writes its template, which logs to the
    console only unless `LOG_FILE_PATH` is set (this compose file sets none).
    A plain `docker run` sets no log options either. Docker's default
    `json-file` log driver does not rotate unless the daemon is set to, so
    such a container keeps all its console output since it was last created,
    which can be months; recreating the container discards it.

-   **What can clear one account.** Every write a registration made to an
    existing account was an admin `PUT` that carried a password and left
    `logout_devices` at its default. So wherever one set the account's
    password, Synapse also deleted every device of the account except one
    whose id is the device id of the API's own token, and every access token
    of the account except the API's own (`set_password` in
    `apps/blackout-server/synapse/handlers/set_password.py`). Two things
    therefore show that no registration set an account's password during a
    period. One is a device with any other id, or an access token, that the
    account had before the period and still has: an owner who has stayed
    signed in on the same session since before it, for instance, or a device
    whose keys Synapse has held since before it
    (`e2e_device_keys_json.ts_added_ms`; Synapse deletes a device's keys with
    the device). For the bot account, that means any device or token other
    than the API's own token and that token's device. The other is the
    account's `users.password_hash` in Synapse's database equal to its value
    in a database backup taken before the period: Synapse salts each new hash
    afresh, so a password set during the period leaves a different hash, even
    where it is the same password. Neither works the other way round: owners
    also sign out and change passwords, so a missing device or a changed hash
    does not show a write.
-   **The account's own trail.** An account written to this way was signed out
    of all its devices (Synapse keeps the token that made the request, so for
    the bot account: all but the API's own token), its display name was set to
    its localpart, and its password became the one the request carried. Two
    parts of that trail are events in rooms, timestamped, and last as long as
    those rooms' history rather than the log. Where the display name changed,
    Synapse re-sent the account's membership in every room it was joined to, so
    each of those rooms holds a membership event of the account carrying its
    localpart as display name. And a registration that went through then joined
    the account to the welcome room through the admin join API
    (`autoJoinWelcomeRoom` in `packages/api/src/routes/auth.ts`, in builds from
    `992b55295f`, 2026-05-24 UTC, wherever `WELCOME_MATRIX_ROOM_ID` was set or
    the alias `WELCOME_MATRIX_ROOM_ALIAS`, by default `#welcome:<domain>`,
    resolved). Where that join succeeded for an account that was not already a
    member, it left a join in that room's timeline. Either can have an ordinary
    cause: an account's owner may set its display name to its localpart, and an
    account may join the welcome room by itself.
-   **The API's `users` table.** The API creates the Blackout `users` row and
    the Matrix account together, with the row's `username` as the account's
    localpart. So a `users` row whose username is the localpart of an account
    that was created directly on the homeserver — the bot account, an admin
    account made with Synapse's own tooling — is a registration that named that
    account. The check finds; it does not clear: the row is absent when the
    invite check then refused the request (the route rolled it back) or the
    account was later deleted, and an account the API itself created that was
    later made a server admin has such a row legitimately. For a burner's or
    an account-number account's localpart a row is not a sign by itself:
    `/matrix/exchange`, where provisioning is trusted, creates one with that
    username legitimately. The access log covers every kind of account, for
    the period it reaches.

## After upgrading

If the homeserver's log has not been copied off the server yet, copy it first
(see "What an operator should check"): step 2 reads it, and rotation keeps
discarding it meanwhile.

1. **Deploy an image that carries the fix.** The default `image_tag` of
   `.github/workflows/deploy-compose-prod.yml`, `stable`, is pushed only by
   `.github/workflows/release.yml` on a `v*` tag push, and the repository has
   no tags, so that default does not carry the fix. Build the API image with
   `.github/workflows/docker.yml`, dispatched by hand on `develop` once this
   fix has merged; it tags the image `main-` followed by the commit's first
   seven characters (and `latest`). Deploy that tag.

    Since 2026-11-08 production has run as a single API process through a
    `docker-compose.override.yml` on the server, the operator's interim
    measure for a separate fix (see "Disclosure"). While that override is in
    place, deploy by hand in the stack directory: set `APP_IMAGE_TAG` to the
    tag in the server's `.env`, which compose reads for the
    `${APP_IMAGE_TAG:-stable}` in `docker-compose.yml`, so later compose
    commands keep it; then run `docker compose pull app` and
    `docker compose up -d --no-deps app`, with no `-f`, so the override is
    read. Or deploy this fix together with that one, by that fix's steps. Do
    not use `.github/workflows/deploy-compose-prod.yml` meanwhile: its
    `canary` and `full-rollout` jobs sync `deploy/docker/production/` to the
    server with `rsync --delete`, which deletes the override (the repository
    has none); its `promote` and `full-rollout` jobs run compose with
    `-f docker-compose.yml`, which reads no override file, so they recreate
    `app` with the background loops off and start the `worker` again; and its
    `canary` job starts `app_canary`, a second API process, beside `app`.

    Keep the proxy block on `POST /v1/auth/register` (see "Disclosure") in
    force until that image is the one serving the route, then take it off.
    The block is in the server's copy of `deploy/docker/production/Caddyfile`,
    which the proxy container mounts as a single file
    (`./Caddyfile:/etc/caddy/Caddyfile:ro`). Such a mount stays on the file
    that was there when the container started. The workflow's sync writes a
    new file in its place rather than writing into it, as does any edit that
    replaces the file, so neither reaches the running proxy, and a
    `caddy reload` (the `canary` and `promote` jobs run one) re-reads the file
    as the container still sees it. The block therefore stays in force through
    a deploy until the proxy container is restarted or recreated. Any restart
    or recreation after a sync (a host reboot, `docker compose restart`, or a
    compose `up` that recreates the proxy) drops it, because the synced file
    has no block. A deploy that does not carry the fix takes the block out of
    the file on disk in the same way, so put it back into the file after one,
    or the proxy's next restart drops it.

    To take the block off once the fixed image serves the route: make sure the
    server's Caddyfile no longer has it (a sync has already removed it; after
    a hand deploy, delete the two lines), recreate the proxy with
    `docker compose up -d --force-recreate --no-deps reverse-proxy` so that it
    reads the file now on disk, and check that the route answers with anything
    other than `503`. A sync replaces every other tracked file in that
    directory too and deletes the untracked ones it does not exclude, so any
    other hand edit made there has to be re-applied as well.

2. Read Synapse's access log, as described above, for every period in which an
   affected image served the route with no block in front of it: from the first
   deploy of an affected build until the block was in place (on a homeserver not
   named `blackout.local`, a build from `bcdbb5c7db` or later; on one named
   `blackout.local`, from `9713cfd181` or later; see "The finding"; if you
   cannot tell which build first served the route, start at the earlier, which
   only widens the search), any later interval in which the block was off (after
   a proxy restart that followed a sync, for instance), and any period in which
   the route was served at `/api/auth/register`, which the block does not cover
   (see "Disclosure"): by any build before `261b79c2f3` (2026-04-05 UTC),
   whatever its start date, and by a later build in an API process started
   before 2026-08-31 (UTC). A `PUT /_synapse/admin/v2/users/…` made with the
   bot's token that answered `200` modified an existing account. For the part
   of those periods that the log no longer covers, look for the room traces and
   the `users` rows described above, and check the homeserver's admin accounts
   and the bot account for the evidence that can clear one account (above).
   Treat each of them that it does not clear as possibly written to: reset its
   password as a precaution (for the bot, the way step 3 says, and rotate
   `MATRIX_BOT_TOKEN`), and review what an admin could have done since the
   start of that uncovered part, as step 3 describes, since the reset does not
   undo it. After the upgrade, the error log
   `matrix.account_create_updated_existing` marks the residual race described
   under "What the fix does not close".
3. For each account found: its password is the one the request carried, so
   set a new one (the admin `PUT /_synapse/admin/v2/users/{mxid}` with
   `password` signs out its devices by default) and treat the account as having
   been in the caller's hands from the time of the write. Unless the request
   was then refused by the invite check, it also created a Blackout `users`
   row with that username and issued the caller a session; that row and its
   sessions belong to the caller and should be removed. Where the `200`
   follows a `201` for the same id, the caller may be the person who created
   the account, retrying (see "What an operator should check"): the new
   password still applies, but find out whose the row is before removing it.

    If an account found is a server admin (`users.admin = 1`), the bot among
    them, the caller could sign in as it with the password they sent and use
    the homeserver's admin API, so review what an admin could have done since
    the write. A password reset does not undo what was done with those
    powers: among other things an admin can create accounts, make an account
    a server admin, set another account's password, add an email address to
    an account, and sign in as any account, another admin included
    (`POST /_synapse/admin/v1/users/{mxid}/login`). Synapse stores a token
    that login API mints under the id of the admin account that minted it, so
    the token lasts until that account's tokens are deleted, which a password
    reset that signs its devices out does, or until the expiry it was minted
    with, if any; a token minted while acting as another admin through that
    API is stored under that other admin. In Synapse's database, look at the
    accounts created since the write (`users.creation_ts`), the server admins
    against the ones you expect (`users.admin = 1`), the email addresses added
    since (`user_threepids.added_at`), and the tokens minted through that
    login API (`access_tokens` rows with `puppets_user_id` set, whose
    `user_id` is the account that minted each).

    If the bot account itself was written to, one more thing holds. Synapse
    keeps only the token that made a password reset, so the API's own token
    survived the caller's write and nothing failed at the time — and for the
    same reason a reset you make now with any token other than the API's
    deletes `MATRIX_BOT_TOKEN`, and every Matrix call from the API fails until
    it is replaced: make that `PUT` with the API's own token, or replace
    `MATRIX_BOT_TOKEN` right after. Rotating it anyway is reasonable for the
    credential of an account that was in a caller's hands.

4. **End the interim measures.** The proxy block is this fix's own and comes
   off in step 1, once the fixed image serves the route. The operator's other
   two, `BLACKOUT_AUTH_ROWS_PRUNE=0` in the server's `.env.production`
   (2026-11-02) and the single-process override (2026-11-08), belong to the
   separate fix named in "Disclosure": they come off once that fix is
   deployed, by its steps, which remove both and restore the `worker`. Leave
   them in place until then, whichever fix is deployed first. Once both fixes
   serve production, none of the three is left: no override, no
   `BLACKOUT_AUTH_ROWS_PRUNE=0`, the `worker` running again, and no block on
   `/v1/auth/register`.

## What the fix does not close

Two windows remain. Both are narrow, and both are named here rather than left
implicit.

1. **A name created between the lookup and the create.** The guard is two bot
   admin calls in sequence (`GET` then `PUT`). If an account with the same id
   is created in the gap between them, the `PUT` updates that account and
   answers `200`. The API detects this, refuses the caller (`matrix_user_exists`)
   and logs `matrix.account_create_updated_existing` at error level — but the
   `PUT` has already run, so **the refusal does not undo the password reset**
   that write applied to the pre-existing account: its password is now the one
   the caller sent. The error log is the operator signal. Closing this fully
   needs an atomic create-if-absent, which the bot-token admin `PUT` does not
   offer. The shared-secret `POST /_synapse/admin/v1/register` is create-only
   but needs the homeserver's registration shared secret, which the API is not
   given; it is the candidate if this is ever load-bearing.

2. **An invitation that stops being usable between preview and redeem.** On
   `/register` the token is previewed before anything is created and consumed
   after, and the redeem checks it again. If in that gap its last use goes
   elsewhere, it is revoked, or it expires, the redeem fails and the route
   rolls back — but only the local row; the Matrix account was already
   created, with the caller's chosen password, and stays. The request is still
   refused (`400 invite_token_invalid`) and issues no Blackout session, but the
   homeserver account exists and the caller knows its password: they can sign
   in to the homeserver directly and, where exchange provisioning is trusted
   (`BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS`, which account-number sign-up also
   needs), obtain a Blackout session through `/matrix/exchange`, which
   provisions a row for that localpart and checks no invitation. The
   invitation was genuinely usable at preview, so this is a race with its
   final use, its revocation or its expiry, not a bypass of the gate.

## Verification

`packages/api/test/register-matrix-collision.integration.test.ts` drives the
real Hono app and `matrixClient` against its own inline fetch stub of the
homeserver (`installMatrix` in that file), which answers the single-user admin
endpoint and records each lookup and create: registering an existing name — the
bot's own localpart among them — gets `409` and sends no create; a garbage token
with the gate on creates nothing and makes no Matrix call; a `PUT` that answers
`200` is refused and rolled back; a lookup that is neither `200` nor `404` fails
closed; ordinary registration still works with one lookup and one create; a
usable token with the gate on registers once and consumes one use;
`registerUser` is covered directly for the lookup, create-only and fail-closed
paths; and `provisionBurner` for the refusal of a create that answers `200` and
for an ordinary create. Each assertion except the usable-token case,
which is a regression guard, was also run against the pre-fix code to confirm it
fails there: with `develop`'s `matrix-client.ts` in place, 9 of the 11 cases
fail (all but the garbage-token and usable-token cases); with `develop`'s
`auth.ts` in place, 3 fail (the existing-name, garbage-token and `200`-create
cases); the fixed tree passes all 11 (re-run 2026-11-08). The run used a stub
homeserver only; nothing was exercised against a real Synapse.

The shared stub, `packages/api/test/_fixtures/matrixStub.ts`, which the
collision test does not use, now answers the single-user admin endpoint too
(`404` or `200` to a lookup, `201` or `200` to a create, from its
`existingUsers`), so that a test built on it that registers an account meets a
free name rather than the empty `200` its fallback gives, which the fix would
refuse; no test uses its new fields yet. The three other test files whose own
stubs would have answered the new lookup with `200` (`invitations`,
`register-welcome-room` and `follows-personal-link`) now answer it with `404`
and the create with `201`.

## Disclosure

This record and the fix are published with the fix's pull request to `develop`,
and the GitHub security advisory for the defect is published when that pull
request merges. The operator's interim measures in production, dated below, are
the proxy block on `POST /v1/auth/register` (2026-11-02), which stays until this
fix is deployed, and production running as a single API process (2026-11-08), a
measure for a separate fix that bears on how this one is deployed.

-   **2026-10-26.** Found and fixed in this change set, against `develop` at
    `3c3c05c`.
-   **2026-11-02.** The operator confirmed the interim measure in production:
    the reverse proxy (Caddy) answers `503` to `POST /v1/auth/register`, so
    that path cannot be reached while the block is in place. In a build from
    `261b79c2f3` (2026-04-05 UTC) on, as every build that can write to an
    account on a homeserver not named `blackout.local` is, an API process
    started on or after 2026-08-31 (UTC) serves the route on no other path:
    `packages/api/src/index.ts` decides once, at start-up, whether to mount the
    `/api` alias, and mounts it only before `API_ALIAS_REMOVAL_DATE`. A process
    started earlier also serves `/api/auth/register` until it restarts, and so
    does an older build whatever its start date (before `77c27bd253`, earlier
    the same day, on no other path); the block does not cover that path. The
    block is in the server's copy of `deploy/docker/production/Caddyfile`;
    "After upgrading" step 1 says how it behaves across a deploy, what removes
    it, and how to take it off. The
    shipped web client does not call `/v1/auth/register` (its sign-up is
    `/v1/auth/account-number`), and burner and account-number sign-up choose
    server-derived names, so the block takes nothing away from them.
-   **2026-11-08.** Production moved to a single API process, the operator's
    interim measure for a separate fix, to the API store's writes across
    processes, which has its own record and advisory. Until that day the
    `worker` ran the background loops as a second process beside `app`; from
    then until that fix is deployed, a `docker-compose.override.yml` on the
    server has `app` run them and scales the `worker` to 0. The measure does
    not bear on this route, only on how this fix is deployed ("After
    upgrading" step 1). It changes the app's environment, so production's API
    has run since then in a container started that day, which does not mount
    the `/api` alias. The same day the operator decided that this fix is
    published with its pull request to `develop`, with CI, and that the GitHub
    security advisory for it is published when that pull request merges. The
    proxy block stays until the fix is deployed.
