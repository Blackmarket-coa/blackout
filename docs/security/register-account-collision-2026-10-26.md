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
instead of being refused.

A second gap sat next to it: under `REQUIRE_INVITE_TOKEN=1` the route created
the Matrix account before it consumed the invitation, so a token that was not
usable left the Matrix account behind even though the request was refused.

Severity is critical. The first gap let anyone, with no session, act on an
account that was not theirs: the accounts with no Blackout row include ones
created directly on the homeserver, such as its admin accounts and the bot
account the API itself uses, which must be a server admin. A registration
naming one of those reset its password and signed out its sessions. The second
gap broke the invite gate, which is meant to be a hard precondition for any
account coming into being.

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
homeserver, not from the API, which kept no record of it:

-   **Synapse's access log.** Every account the API created is a
    `PUT /_synapse/admin/v2/users/…` made with the bot's token. A new account
    answers `201`; a `200` means an existing account was modified. Look at the
    admin accounts (`users.admin = 1` in Synapse's database) and the bot
    account first.
-   **The account's own trail.** An account written to this way was signed out
    of all its devices, and its display name was set to its localpart.

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
registration still works with one lookup and one create; and `registerUser` /
`provisionBurner` are covered directly for the lookup, create-only and
fail-closed paths. Each assertion was also run against the pre-fix code to
confirm it fails there. The run used a stub homeserver only; nothing was
exercised against a real Synapse.
