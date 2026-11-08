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
since the Matrix client's first commit on `develop` (`9713cfd181`, 2026-03-23),
and `/register` has called it since that same commit, so every build of the API
from that commit to the merge of this fix is affected.

A second gap sat next to it: under `REQUIRE_INVITE_TOKEN=1` the route created
the Matrix account before it consumed the invitation, so a token that was not
usable left the Matrix account behind even though the request was refused.

Severity is critical. The first gap let anyone, with no session, act on an
account that was not theirs: the accounts with no Blackout row include ones
created directly on the homeserver, such as its admin accounts and the bot
account the API itself uses, which must be a server admin. A registration
naming one of those set its password to the one the caller sent and signed out
its sessions. The second gap broke the invite gate, which is meant to be a hard
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
consistency.

**The route.** `/v1/auth/register` maps the refusal to `409 user_exists` — the
same answer a local username clash already gives, so the response does not tell
a caller which Matrix accounts exist — and rolls the local row back. A
presented invite token is checked (`previewInvitation`) before the local row or
the Matrix account is created, and consumed after; with the gate on, an
unusable or absent token now creates nothing.

The only other admin endpoint that can create an account,
`POST /_synapse/admin/v1/register` (nonce flow), is used only by an operations
shell script (`infra/single-server-baseline/synapse/verify-launch.sh`), not by
the API, and takes no caller-chosen name.

## What an operator should check

Whether the first gap was used before the fix is deployed can be read from the
homeserver. The API recorded nothing that marks such a request on its own: each
registration row is ordinary by itself. One cross-check on the API side does
exist and is listed last.

-   **Synapse's access log.** Every account the API created is a
    `PUT /_synapse/admin/v2/users/…` made with the bot's token. A new account
    answers `201`; a `200` means an existing account was modified. Look at the
    admin accounts (`users.admin = 1` in Synapse's database) and the bot
    account first.
-   **The account's own trail.** An account written to this way was signed out
    of all its devices (Synapse keeps the token that made the request, so for
    the bot account: all but the API's own token), its display name was set to
    its localpart, and its password became the one the request carried.
-   **The API's `users` table.** The API creates the Blackout `users` row and
    the Matrix account together, with the row's `username` as the account's
    localpart. So a `users` row whose username is the localpart of an account
    that was created directly on the homeserver — the bot account, an admin
    account made with Synapse's own tooling — is a registration that named that
    account. The check finds; it does not clear: the row is absent when the
    invite check then refused the request (the route rolled it back) or the
    account was later deleted, and an account the API itself created that was
    later made a server admin has such a row legitimately.

## After upgrading

1. Deploy the API at or after the merge of this fix, and keep the interim
   proxy block on `POST /v1/auth/register` (see "Disclosure" below) in force
   until the image that carries the fix is the one serving the route. The
   block lives in the server's copy of `deploy/docker/production/Caddyfile`,
   which the `canary` and `full-rollout` jobs of
   `.github/workflows/deploy-compose-prod.yml` replace from the repository
   (the `promote` job runs no sync). The two modes differ in when the running
   proxy drops it:

    - `canary` (the dispatch default) syncs the directory, brings up
      `app_canary` beside the stable `app` and reloads Caddy at once. The
      repository's Caddyfile names `app:3000` as its only upstream, so from
      that reload until the separate `promote` job has replaced `app`, the
      previous image serves the route with no block in front of it. If you
      deploy this way, put the block back into the server's Caddyfile and
      reload the proxy right after the canary job has synced, keep it until
      `promote` has replaced `app`, and only then take it off.
    - `full` syncs the directory too but reloads nothing, so the running
      proxy keeps the block until it is reloaded or its container is
      recreated or restarted. Once the new `app` is healthy, reload the
      proxy; that takes the block off.

    Afterwards check that the route answers with anything other than `503`.
    The same sync replaces every other tracked file in that directory, so any
    other hand edit made there has to be re-applied as well.

2. Read Synapse's access log, as described above, for the whole period before
   the block was in place and for any interval in which the block was off
   while the previous image still served the route (the canary-to-promote
   interval, for instance): a `PUT /_synapse/admin/v2/users/…` made with the
   bot's token that answered `200` modified an existing account. After the
   upgrade, the error log `matrix.account_create_updated_existing` marks the
   residual race described under "What the fix does not close".
3. For each account found: its password is the one the request carried, so
   set a new one (the admin `PUT /_synapse/admin/v2/users/{mxid}` with
   `password` signs out its devices by default) and treat the account as having
   been in the caller's hands from the time of the write. Unless the request
   was then refused by the invite check, it also created a Blackout `users`
   row with that username and issued the caller a session; that row and its
   sessions belong to the caller and should be removed.

    If the bot account itself was written to, two more things hold. Synapse
    keeps only the token that made a password reset, so the API's own token
    survived the caller's write and nothing failed at the time — and for the
    same reason a reset you make now with any token other than the API's
    deletes `MATRIX_BOT_TOKEN`, and every Matrix call from the API fails until
    it is replaced: make that `PUT` with the API's own token, or replace
    `MATRIX_BOT_TOKEN` right after. Rotating it anyway is reasonable for the
    credential of an account that was in a caller's hands. And the caller
    could sign in as the bot, a server admin, with the password they sent, so
    review what an admin could have done since; among other things an admin
    can mint an access token for any account
    (`POST /_synapse/admin/v1/users/{mxid}/login`), and resetting the bot's
    password does not end such tokens on other accounts.

## What the fix does not close

Two windows remain. Both are narrow, and both are named here rather than left
implicit.

1. **A name created between the lookup and the create.** The guard is two bot
   admin calls in sequence (`GET` then `PUT`). If an account with the same id
   is created in the gap between them, the `PUT` updates that account and
   answers `200`. The API detects this, refuses the caller (`matrix_user_exists`)
   and logs `matrix.account_create_updated_existing` at error level — but the
   `PUT` has already run, so **the refusal does not undo the password reset**
   that write applied to the pre-existing account. The error log is the operator
   signal. Closing this fully needs an atomic create-if-absent, which the admin
   API does not offer; the nonce-based `POST /_synapse/admin/v1/register` is
   create-only and is the candidate if this is ever load-bearing.

2. **An invitation used up between preview and redeem.** On `/register` the
   token is previewed before anything is created and consumed after. If its
   last use goes elsewhere in that gap, the redeem fails and the route rolls
   back — but only the local row; the Matrix account was already created, with
   the caller's chosen password, and stays. The request is still refused
   (`400 invite_token_invalid`) and no Blackout session is issued, so nothing
   signs in through the API, but the homeserver account exists. The invitation
   was genuinely usable at preview, so this is a race on its final use, not a
   bypass of the gate.

## Verification

`packages/api/test/register-matrix-collision.integration.test.ts` drives the
real Hono app and `matrixClient` against a stub homeserver
(`packages/api/test/_fixtures/matrixStub.ts`, which now answers the single-user
admin endpoint): registering an existing name — the bot's own localpart among
them — gets `409` and sends no create; a garbage token with the gate on creates
nothing and makes no Matrix call; a `PUT` that answers `200` is refused and
rolled back; a lookup that is neither `200` nor `404` fails closed; ordinary
registration still works with one lookup and one create; a usable token with
the gate on registers once and consumes one use; and `registerUser` /
`provisionBurner` are covered directly for the lookup, create-only and
fail-closed paths. Each assertion except the usable-token case, which is a
regression guard, was also run against the pre-fix code to confirm it fails
there: with `develop`'s `matrix-client.ts` in place, 9 of the 11 cases fail
(all but the garbage-token and usable-token cases); with `develop`'s `auth.ts`
in place, 3 fail (the existing-name, garbage-token and `200`-create cases); the
fixed tree passes all 11 (re-run 2026-11-08). The run used a stub homeserver
only; nothing was exercised against a real Synapse.

## Disclosure

-   **2026-10-26.** Found and fixed in this change set, against `develop` at
    `3c3c05c`. The fix was kept out of the public repository until the interim
    measure below was in place and the operator had decided how to publish it
    (2026-11-08, below).
-   **2026-11-02.** The operator confirmed the interim measure in production:
    the reverse proxy (Caddy) answers `503` to `POST /v1/auth/register`, so the
    affected route cannot be reached while the block is in place. That is the
    only path that served the route: its `/api` alias has been off since
    2026-08-31 (`API_ALIAS_REMOVAL_DATE` in `packages/api/src/index.ts`). The
    block is in the server's copy of `deploy/docker/production/Caddyfile`,
    which the `canary` and `full-rollout` jobs of
    `.github/workflows/deploy-compose-prod.yml` replace from the repository
    (`promote` reloads what is on disk), so a deploy that does not carry this
    fix removes the block and it has to be put back; "After upgrading" above
    says how to keep it in force through the deploy that does carry it. The
    shipped web client does not call `/v1/auth/register` (its sign-up
    is `/v1/auth/account-number`), and burner and account-number sign-up choose
    server-derived names, so the block takes nothing away from them.
-   **2026-11-08.** The operator decided the fix is published as an ordinary
    pull request to `develop`, with CI, and the GitHub security advisory for it
    is published when the pull request merges. The proxy block stays until the
    fix is deployed.
