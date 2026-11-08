# Store writes across processes — the whole-table resync, 2026-10-31

The API's Postgres store wrote 38 of its mutators through as a **whole-table
resync**: the writing process read every key in the table, deleted each row its
own in-memory mirror did not hold, and rewrote every row from its own copy. Any
row another process had written and this one had not yet heard of was deleted;
every row it held a stale copy of was reverted; a row another process had
deleted came back. Peers then reloaded the table, so the loss reached every
mirror. This record covers that defect and its fix (PR 1 of the plan), what was
run to show both, what it leaves open, and what the operator has to decide.

**Rating:** High. Fixed by this change, the pull request from
`claude/bmc-transmutation-strategy-6jenal-v49` to `develop`; every `develop`
commit from `eb71cc56c3` (the merge of #878, 2026-08-10, which added the
store's Postgres writer with the resync) up to that merge has the defect. The
dates and the operator's interim measures are under "Disclosure"; what to do
at deploy is under "After upgrading".
**State read:** `develop` at `ff7d08bfa0`. The fix is the commits after it on the
branch (listed under "Commits"). The branch has since merged `develop` three
times, at `f6da7b7d16` (`a0f6012736`), at `7bda9eb72a` (`51a37fa8b9`) and at
`27d8c17051` (`f2054bd111`). None of the three changed a file under
`packages/api/src` or `packages/api/test`: the first brought `develop`'s
`@hono/node-server` 2.1.3 into `packages/api/package.json`, and the other two
changed nothing under `packages/api`.
**Read** means a claim rests on the code; **Run** that it was observed in Node
22.22.0 in this worktree, on PGlite or on PostgreSQL 16.15 as stated; **Test**
names the regression test that keeps it true. No production deployment was
examined. A review of the branch found one high, one medium and seventeen low findings;
what changed because of them is under "Changed after review round 1". A second
review found two medium findings, both fixed (under "Changed after review round
2"). A third found eight low findings, all fixed (under "Changed after review
round 3"). The sections below describe the code after those changes. A
review of the text for publication found four sentences in this record that
were not exact; they are corrected (under "Changed in the publication
review").

| ID  | Finding                                                                                                                                                                         | Verified                     | Disposition                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| S1  | A whole-table resync deletes rows other processes wrote and rewrites the rest from one process's mirror                                                                         | Run (develop), test          | Fixed: 38 resync specs and 4 unspecced methods became targeted statements |
| S2  | Four email-verification and reset-token mutators had no spec, so their change reached Postgres only if a later resync of the same table rewrote it; otherwise a restart lost it | Read, test (X13)             | Fixed with S1                                                             |
| S3  | `purgeUserAuthArtifacts` listed `revokedSessions`, which it never writes, and omitted `linkedAccounts`, which it does                                                           | Read, test (X7, U1)          | Fixed with S1                                                             |
| S4  | The resync keyed composite rows with a `:` join, which never matched a `circleEdges` key (`a::b`)                                                                               | Read, test (U2, X6)          | Fixed with S1                                                             |
| S5  | A change notification was sent after the write, on another connection, so it could be lost, or announce a rolled-back write                                                     | Read, test (X15, X18)        | Fixed for targeted writes; upserts still notify after commit (open, O4)   |
| S6  | A peer's `'u'` refresh only ever set a row, so a deleted row stayed in the peer's mirror until a table reload                                                                   | Read, test (X14)             | Fixed: `'u'` and `'k'` remove a key whose row is gone                     |
| S7  | Four other methods write a mirror map and have no spec: closing a governance vote, a mirrored aid post, campaign attribution and engagement                                     | Read, test (U1 allowlist)    | Open: not persisted in Postgres mode; for the operator (O8)               |
| S8  | Account deletion's denylist write for the current token cannot persist (`revoked_sessions.user_id` cascades from `users`)                                                       | Read                         | Open, pre-existing (O6, decision 6)                                       |
| S9  | One dropped LISTEN connection raised two errors and was replaced twice: every notification delivered twice, two rehydrates, a leaked connection                                 | Run (PostgreSQL 16.15), test | Fixed after review round 1; pre-existing                                  |

## Disclosure

-   **2026-11-02.** The operator confirmed `BLACKOUT_AUTH_ROWS_PRUNE=0` in
    production (decision 1 below), set in the server's `.env.production`,
    which the production compose file loads into both `app` and `worker`
    (`x-common-env` in `deploy/docker/production/docker-compose.yml`). That
    stops the one request-less trigger on the security tables, the hourly
    prune of `revoked_sessions`, `pending_oauth_links` and
    `pending_oidc_logins`. Two loops still resync a table with no request,
    neither of them a security table: the daily retention sweep
    (`coalition_external_activity`, when a quarantined reply is due) and, with
    the FBM bridge on, the flash-mob pin sweeper (`coalition_spatial_items`)
    (S1). The triggers a request reaches (sign-up rollback, the token
    consumes, sign-out, token refresh, revoke-all, a password change, account
    deletion, unlinking an account, the keyed deletes) stayed live in the
    code. In the operator's deployment, the sign-up route whose rollback S1
    lists (`POST /v1/auth/register`) has answered `503` at the reverse proxy
    since the same day, a separate measure, recorded with the fix for that
    route; the other routes S1 lists, the consumes that need no sign-in among
    them, stayed reachable. Until 2026-11-08 production ran the API (`app`)
    and the `worker` as two processes on one database, so the defect's
    precondition (S1) held.
-   **2026-11-08.** The operator confirmed that production runs as a single
    process until this fix is deployed. A `docker-compose.override.yml` on the
    server sets the app's `BLACKOUT_BACKGROUND_WORKERS_DISABLED` to `'0'`, so
    the API process runs the background loops (`src/index.ts` starts them
    unless the variable is `'1'`), and scales the `worker` service to 0
    replicas. `BLACKOUT_AUTH_ROWS_PRUNE=0` still applies, now to the app. The
    defect needs more than one process writing one database (S1), so with one
    process no write of this kind can destroy another process's row; that
    holds while no other process writes that database. The operator decided
    the same day to publish this change only after that switch.
-   **Publication.** The fix is published with its pull request to `develop`,
    with this record; the GitHub security advisory is published when the pull
    request is merged. The fix removes the whole-table resync (S1 to S6, and
    S9); it does not close the read-side gaps (O1 to O4), and nothing records
    whether any row was lost in production before it (S1, "Detection"). The
    steps for the deploy, which end with the interim measures removed, are
    under "After upgrading".

---

## S1 — the whole-table resync

**The behaviour (Read, on `develop`).** `MUTATOR_SPECS` in
`packages/api/src/db/pgDescriptors.ts` gave 38 mutators the kind `resync`. After
the mutator changed the mirror, `WriteBehindQueue` ran `resyncMap`
(`pgWriter.ts`) for each listed map. `resyncMap` selected every key of the
table, deleted each row whose key the mirror did not hold, then upserted every
mirror record as a whole row. None of it ran in a transaction and none of it was
conditional. Afterwards the queue published `'r'`, and every peer reloaded the
whole table (`store.ts`, `applyPeerChange`). Four more methods that write those
maps (S2) had no spec at all, so their change reached Postgres only when some
later resync of the table rewrote it.

So, for one resync of a table, by the process P that ran it:

-   a row another process wrote that P had not heard of was **deleted**;
-   a row P held a stale copy of was **rewritten from that copy**;
-   a row another process had deleted that P still held was **re-inserted**;
-   every peer then took Postgres's damaged table into its mirror.

**Who can trigger it (Read, on `develop`).**

-   Anyone, unauthenticated: `/register` rolls back a failed sign-up with
    `deleteUser`, which resynced `users` (`routes/auth.ts`, four call sites). The
    auth rate limit is 10 requests a minute per address.
-   Anyone holding a single-use token or a pending sign-in for an account of
    their own, without being signed in: confirming a password reset or an email
    verification (`routes/auth.ts`, `/password/reset/confirm` and
    `/email/verify/confirm`) and completing an OIDC sign-in
    (`routes/auth-oidc.ts`) each consume a row (#2, #3, #14), which resynced
    `password_reset_tokens`, `email_verification_tokens` or
    `pending_oidc_logins`.
-   Any signed-in account: logout and refresh (`services/refreshToken.ts`),
    revoke-all and password change (`routes/auth.ts`), account deletion
    (`services/accountLifecycle.ts`), unlinking an account, and deleting a vault
    item, a webhook or a bridge.
-   The process that runs the background loops (the `worker` in the production
    compose file), with no request at all. The auth-rows prune
    (`services/authRowsPruneScheduler.ts`) runs at boot and then hourly,
    resyncing `revoked_sessions`, `pending_oauth_links` and `pending_oidc_logins`.
    It is on unless `BLACKOUT_AUTH_ROWS_PRUNE=0` (`packages/api/src/backgroundLoops.ts`).
    It is the one request-less trigger on the security tables. Two other loops
    resync a table with no request: the retention sweep of quarantined external
    replies (`services/coalitionExternalRetentionScheduler.ts`, at boot and then
    daily, on unless `BLACKOUT_COALITION_EXTERNAL_RETENTION_SWEEP=0`) resynced
    `coalition_external_activity` whenever a reply was due
    (`deleteCoalitionExternalActivities`, #32); and, only with the FBM bridge on
    (`FBM_MATRIX_BRIDGE_ENABLED`), the flash-mob pin sweeper
    (`services/fbmMatrixBridge/flashMobDispatcher.ts`, every 5 minutes) resynced
    `coalition_spatial_items` whenever an ephemeral pin was due
    (`deleteCoalitionSpatialItem`, #30).

It needs more than one process on one database. Postgres mode is the default
whenever `DB_HOST` is set; the shipped production compose file runs `app` and
`worker` on one database, and the Kubernetes manifest runs three API replicas.

**The window.** A change P would normally hear of was exposed for the
notification lag: on loopback PostgreSQL 16 the design lens measured p99 16 ms
and max 32 ms. A change P never heard of (the boot gap between hydrating and
LISTEN, a failed publish, a failed peer refresh, a half-open listener) was
deleted or overwritten deterministically by P's next resync of that table. A
resync of 1,100 rows took 0.5 to 0.7 s (Cost, below), and every later write in
that process queued behind it.

**What was lost (Run on `develop`, PGlite, two or more stores on one database,
by the two original probes and the design's three lenses).**

-   **Revoked sessions accepted again, on every replica.** The worker's prune
    deleted an unexpired revocation the app had just written (1 row to 0), and a
    process booted afterwards treated the token as not revoked. The app's own
    mirror lost it too, through the `'r'` reload. An access token lives up to
    24 hours (`services/auth.ts`).
-   **Logout-everywhere cutoffs moved back** to an older value.
-   **Another person's account deleted.** Deleting one account deleted an account
    another process had just created (1 row to 0), and with it, through
    `ON DELETE CASCADE`, its refresh tokens, revocations, linked accounts,
    bridges, webhooks and vault items. Only an account with no non-cascading
    reference (messages, votes, tips) can be deleted this way.
-   **Reuse detection lost.** A family revoke deleted a successor refresh token
    the revoking process had not heard of, and the foreign key then nulled the
    parent's `replaced_by`.
-   **Password changes reverted**, and **deleted rows resurrected** (vault items,
    webhooks, stream destinations, purged tokens).

The regression tests below are those runs: X1 and X2 are the two original
probes (`resync-revoked` and `resync-users`). With `develop`'s specs they fail,
with every other new cross-process test but one, on PGlite and on PostgreSQL
16.15 (Mutation checks, below).

**Detection.** A resync that destroyed rows finished normally: nothing was
logged, counted or kept. The lost and reverted rows cannot be rebuilt from
Postgres, and whether any loss happened in production is unknown.

## The fix (PR 1)

No spec reconciles a table any more. `MutatorSpec` has two kinds: `upsert` (the
record the method returned, as before) and `targeted`, a list of fixed
statements (`TargetedStep` in `pgWriter.ts`) of five forms: `deleteKey`,
`deleteKeys`, `deleteWhere`, `updateWhere` and `upsertEach`.

-   **Statements are literal and checked.** The SQL of each step is fixed per
    table. Values are bound parameters, taken from the call's arguments, its
    result, and the keys it changed in the mirror (`StepContext.changed`, with
    each key's record before and after). The compiler refuses a `WHERE` with no
    parameter and a statement separator. `init` compiles every step and
    `PREPARE`s it against the live schema in one transaction; a step that does
    not fit (an unknown column inside a literal, a missing guard column, a map
    no table descriptor names) makes `init` reject, and `runtimeStoreBoot` does
    not catch it, so the process does not start (U4). A step on a table this
    database does not have yet (a migration not applied, which can happen only
    with `BLACKOUT_DB_MIGRATE_ON_START=0`) is left out and logged
    (`pg_store_targeted_step_skipped`), as `develop` skipped an upsert to a
    missing table: the store boots, and the method's other steps still run
    (U4b).
-   **Set-based predicates run in Postgres**, so they reach rows the calling
    process never saw: an unseen successor refresh token, a sibling bounty
    application, an expired row another process wrote.
-   **Guards compare by column type.** A timestamp guard compares at millisecond
    precision, `NULL`-safe. A plain `=` against a `DEFAULT NOW()` column (which
    keeps microseconds on PostgreSQL) matched 1 row in 2,000 in a run on
    PostgreSQL 16.15 for the design; the millisecond form matched all 2,000.
-   **One transaction per call, notification inside it.** A targeted op runs on
    one connection as `BEGIN`, its statements, the `'k'` notifications naming the
    key column values of every row the statements returned (split to stay within
    7,000 bytes), `COMMIT`. Postgres delivers a `NOTIFY` on commit and drops it on
    rollback (checked on PostgreSQL 16.15), so a committed change is announced and
    a rolled-back one is not. A `required` step that matches no row rolls the op
    back and counts `db_targeted_write_conflicts_total{map,method}`. The op is
    retried once; keys returned by an attempt whose `COMMIT` did not report back
    are announced and re-read with the retry's. A retry whose gate then misses
    may be missing that attempt's own commit, so that miss is logged
    (`db_targeted_write_conflict_after_uncertain_commit`) and not counted
    (X8d). Because the notification is part of the transaction, a `NOTIFY` that
    fails fails the write (O14).
-   **Self-refresh.** After the op, every key where Postgres's effect and the
    mirror's differ (the symmetric difference of returned and changed keys) is
    re-read into the mirror, and so is every key an upsert returned whose row
    Postgres merged with the record written (a mesh envelope's `seen_by`, X9).
-   **Receivers re-read by key.** A peer re-reads every key a `'k'` or `'u'`
    names: a row found is put into its mirror, a key with no row is removed.
    `'r'` is no longer sent; it is still received, as a table reload, for one
    release, for processes still on the old code. A reload or rehydrate replaces
    a plain `Map`; a map of its own kind (a subclass that indexes its rows) is
    updated in place through its own methods, and the write capture calls a
    map's own `set`, `delete` and `clear` too.
-   **A per-key fence.** While this process has a queued write for a key, a
    refresh skips that key and re-reads it once the write lands. A key that had
    a queued write when the refresh's `SELECT` was sent, and has none when its
    reply is applied, is read again: the write may have committed after the
    `SELECT`'s snapshot. So a refresh (a peer's `'u'` or `'k'`, a `'r'`, the
    rehydrate after a reconnect) cannot take back a local write, whether the
    write is still queued when the reply arrives (X16, X16b, X16c) or landed
    while the reply was in flight (X16d). Before review round 1 only the first
    case held: a write that committed between a refresh's snapshot and its
    reply was overwritten in the writing process's own mirror, which could
    take back a logout there.
-   **Durability waits for writes only.** `flushRuntimeStoreWrites`, which the
    account-number sign-up with an invite and the marketplace webhook await
    before they answer, waits for the write queue (`drainWrites`), not for the
    mirror refreshes queued on the apply chain. `drain()`, for shutdown and
    tests, waits for both.
-   **One listening connection.** A dropped LISTEN connection is released and
    replaced once, however many errors it raises, so the rehydrate after it
    runs once (S9).
-   **Nothing after the original call throws into the caller.** A failure to
    capture, bind or queue is logged and counted as a lost write
    (`db_write_behind_failures_total`), as a write that fails twice always was.

### Per mutator

"Unseen" means the statement also reaches rows the calling process has not
heard of. Tests are in `packages/api/test/store-cross-process.integration.test.ts`
unless marked; U3 (`pg-writer-targeted`) compiles and `PREPARE`s every step of
every spec, and U6 (`store-spec-coverage`) checks every targeted mutator's
captured keys, so neither is repeated per row.

| #     | Mutator                                                                                     | Now                                                                                                                                                                                                                                                     | Unseen   | Test                                |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------- |
| 1     | `deleteUser`                                                                                | One transaction: `DELETE … WHERE <fk> = $1` for each of the 20 `USER_CASCADE_CHILDREN`, then `DELETE FROM users WHERE id = $1`. `revoked_sessions` is left to the cascade (D1 below); so is a child row another process inserts while the op runs (O15) | children | X2, X17, U7                         |
| 2–4   | `consumePasswordResetToken`, `consumeEmailVerificationToken`, `consumeAccountDeletionToken` | `UPDATE … SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL`, values from the call's record; nothing when the call changed nothing                                                                                                             | —        | X5                                  |
| 5     | `deleteInvitationAdmissionsForUser`                                                         | `DELETE … WHERE claimed_by_user_id = $1 OR ($2::text IS NOT NULL AND matrix_user_id = $2::text)`                                                                                                                                                        | yes      | X7b                                 |
| 6     | `purgeUserAuthArtifacts`                                                                    | One transaction, six `DELETE … WHERE <user column> = $1`: the three token tables, `refresh_tokens`, `linked_accounts`, `pending_oauth_links` (S3)                                                                                                       | yes      | X7, U1                              |
| 7     | `revokeRefreshTokenFamily`                                                                  | `UPDATE refresh_tokens SET revoked_at = $2, revoked_reason = $3 WHERE family_id = $1 AND revoked_at IS NULL`; `$2` is the time the mutator stamped on the mirror (D3)                                                                                   | yes      | X3                                  |
| 8     | `revokeRefreshTokensForUser`                                                                | The same, `WHERE user_id = $1 AND revoked_at IS NULL`                                                                                                                                                                                                   | yes      | X4                                  |
| 9     | `pruneExpiredRevokedSessions`                                                               | `DELETE FROM revoked_sessions WHERE expires_at <= $1`, `$1` the call's `now`                                                                                                                                                                            | yes      | X1, X19                             |
| 10    | `acceptBountyApplication`                                                                   | One transaction: (required) claim the bounty `WHERE id = $1 AND status = 'open'`; (required) accept the application `WHERE id = $1 AND status = 'pending'`; decline `WHERE bounty_id = $1 AND id <> $2 AND status = 'pending'`                          | siblings | X8, X8b, X8c                        |
| 11    | `deleteLinkedAccount`                                                                       | `deleteKey (blackout_user_id, provider)`                                                                                                                                                                                                                | —        | `pg-notify-replication`             |
| 12    | `consumePendingOAuthLink`                                                                   | As 2, `WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > $2`                                                                                                                                                                               | —        | X5                                  |
| 13    | `prunePendingOAuthLinks`                                                                    | `DELETE … WHERE expires_at <= $1`                                                                                                                                                                                                                       | yes      | X1b                                 |
| 14    | `consumePendingOidcLogin`                                                                   | As 12, on `pending_oidc_logins`                                                                                                                                                                                                                         | —        | X5                                  |
| 15    | `prunePendingOidcLogins`                                                                    | As 13                                                                                                                                                                                                                                                   | yes      | X1b                                 |
| 16–29 | the 14 bridge, webhook, token, panel, listing, vault and reward deletes                     | `deleteKey` by the descriptor's key (`deleteTwitchEventSubscription` by its Helix id)                                                                                                                                                                   | —        | X15, X16c, X18 on `deleteVaultItem` |
| 30    | `deleteCoalitionSpatialItem`                                                                | `deleteKey` guarded on `updated_at` as the mirror held it, at millisecond precision; a copy with no `updatedAt` matches any row (`nullMatchesAny`, as #32)                                                                                              | —        | X12                                 |
| 31    | `deleteCoalitionExternalActivity`                                                           | `deleteKey`                                                                                                                                                                                                                                             | —        | U3, U6                              |
| 32    | `deleteCoalitionExternalActivities`                                                         | One `DELETE … USING unnest(ids, versions)` of the replies the call removed, each guarded on its `updated_at` (D5)                                                                                                                                       | —        | X11, X11b                           |
| 33    | `removeCircleEdge`                                                                          | `deleteKey (follower_id, followee_id)` (S4)                                                                                                                                                                                                             | —        | X6                                  |
| 34–35 | `enqueueMeshEnvelope`, `replaceMeshEnvelopes`                                               | Upsert each envelope the call added or changed, `seen_by` merged with Postgres's (each node once, first-seen order) and the merged row re-read by the writer; delete by id each envelope the call dropped (D6)                                          | —        | X9                                  |
| 36    | `deleteClip`                                                                                | `deleteKey`                                                                                                                                                                                                                                             | —        | U3, U6                              |
| 37    | `upsertColiseumArguments`                                                                   | Upsert each argument the call changed, whole                                                                                                                                                                                                            | —        | X10                                 |
| 38    | `deletePluginInstallation`                                                                  | `deleteKey`                                                                                                                                                                                                                                             | —        | U3, U6                              |
| 39    | `deleteExpiredPasswordResetTokens` (no spec before)                                         | `DELETE … WHERE expires_at < $1`                                                                                                                                                                                                                        | yes      | X13b                                |
| 40    | `markEmailVerificationTokenSent` (no spec before)                                           | `UPDATE … SET sent_at = $2 WHERE id = $1 AND sent_at IS NULL`                                                                                                                                                                                           | —        | X13                                 |
| 41    | `revokeEmailVerificationTokensForUser` (no spec before)                                     | `UPDATE … SET revoked_reason = $2 WHERE user_id = $1 AND consumed_at IS NULL AND revoked_reason IS NULL`                                                                                                                                                | yes      | X13                                 |
| 42    | `deleteExpiredEmailVerificationTokens` (no spec before)                                     | `DELETE … WHERE expires_at < $1 AND consumed_at IS NULL`                                                                                                                                                                                                | yes      | X13b                                |
| —     | allowlist (U1)                                                                              | No spec, on purpose: the three in-memory diagnostics (`touchTwitchIrcBotTokenUsed`, `touchObsWsPasswordUsed`, `touchWidgetAlertTokenDelivered`) and 16 test seams; plus the four known gaps of S7                                                       | —        | U1                                  |

Every statement ends in `RETURNING` its key columns.

### Where the build departs from the design

"The design" is the plan this was built from: three designs judged against
each other before any code, outside the tree. Where it did not fit the code,
the code won; each case is in its commit message too.

-   **D1 — a deleted account's revocations stay in the mirrors.** The design
    deleted every cascading child explicitly. `revoked_sessions.user_id` cascades
    from `users` too, but deleting those rows explicitly would tell every
    process to drop the account's revocations, so every process would accept
    the account's logged-out tokens at once, for the rest of their lifetime (up
    to 24 hours). Postgres still drops them with the account; the running
    mirrors keep refusing those tokens until they restart. Nothing reads a
    revocation as proof that an account exists. `USER_CASCADE_LEFT_IN_MIRRORS`
    holds this one exception, U7 checks the two lists against the foreign-key
    catalogue, and X17 checks that the peer still refuses the token.
-   **D2 — an account deletion is written even when the deleting process has not
    heard of the account.** The child deletes are set-based, so the op is queued
    whether or not the mirror held the account, and the account row is deleted
    by the id the caller passed. A deletion confirmed on a process that has not
    yet heard of the account still deletes it.
-   **D3 — revocation timestamps.** The design's prototype bound `revoked_at` to
    the time the op was built. The mutator stamps its own time on the mirror's records and
    returns a count, so the statement binds the mirror's value; otherwise
    Postgres and the mirror would hold different times and no re-read would
    notice (the returned keys equal the changed ones). X4 checks it.
-   **D4 — the bounty gates.** Both gates are `required`, as designed. When a
    second process accepts after the first one did (X8b), every statement
    already matches nothing, so without the gates Postgres ends the same and
    only the conflict count shows the difference. The gates decide the outcome
    when the bounty was claimed another way: X8c (claimed directly on another
    process) needs them, or an application is accepted and its sibling declined
    under a bounty claimed by someone else. X8c was added for this.
-   **D5 — the retention sweep deletes only what it judged.** The design's
    statement also deleted, unguarded, ids the mirror did not hold. The sweep
    passes ids from its own mirror, so this deletes only the replies the call
    removed, each guarded on the `updated_at` it judged. A reply whose mirror
    copy has no `updated_at` is deleted regardless, so a missing timestamp
    cannot keep a stranger's words.
-   **D6 — mesh envelopes.** Enqueue and replace share one spec, which writes
    exactly what the call changed in the mirror, as the design's table says.
    The design lens's prototype had deleted by `expires_at` instead; the C5
    commit message wrongly calls that the design's. The design's
    `SELECT DISTINCT` union lost the nodes' order, and the writer never re-read
    the merged row, so it kept re-offering the envelope to nodes another
    process had recorded; both changed after review round 1.
-   **D7 — coliseum arguments.** The design upserted every record passed; this
    upserts the ones the call changed, so an argument passed back unchanged is
    not rewritten.
-   **D8 — the allowlist.** The design's scan covered methods that write the 33
    resync maps (seven). U1 scans every map, and finds five more methods with no
    spec: `touchWidgetAlertTokenDelivered` (an in-memory diagnostic, by its
    file-store comment) and the four in S7.
-   **D9 — the queue's map accessor is gone.** Only the resync used it.
-   **D10 — the replication test.** Its delete already went out as `'k'` after
    commit 3; it now also asserts that a `'k'` was sent and no `'r'`.

## Tests

`packages/api/test/store-cross-process.integration.test.ts` runs two or more
`PostgresBackedDb` stores on one database, each with its own pool and change
transport, as the API replicas and the worker do. PGlite by default; with
`BLACKOUT_TEST_PG_URL` set, each test gets its own PostgreSQL database copied
from a migrated template. A process's transport can be made deaf ("has not
heard yet"), and every notification is recorded. PGlite's clock ticks in
milliseconds, so the tests that need microseconds write them explicitly.

| Test          | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1            | The original `resync-revoked` probe: the worker's prune keeps a live revocation and a later logout-everywhere cutoff it had not heard of, and prunes the expired row; the app and a process booted afterwards still refuse the token and keep the later cutoff                                                                                                                                                                                                                                           |
| X1b           | The OAuth and OIDC state prunes keep an unexpired row the pruning process had not heard of, and remove an expired one                                                                                                                                                                                                                                                                                                                                                                                    |
| X2            | The original `resync-users` probe: deleting one account keeps an account the deleting process had not heard of, in Postgres and in the peer's mirror                                                                                                                                                                                                                                                                                                                                                     |
| X3            | A family revoke reaches the successor a peer minted; the parent keeps `replaced_by` and `rotated`; both mirrors hold Postgres's rows                                                                                                                                                                                                                                                                                                                                                                     |
| X4            | Revoke-all reaches a token a peer minted, and a token the revoking process held carries in Postgres the time its mirror stamped                                                                                                                                                                                                                                                                                                                                                                          |
| X5            | For all five consumes, Postgres keeps the first `consumed_at` and the stale process re-reads it. A consume of an OAuth or OIDC state row Postgres holds as expired, on a process whose copy is not, records nothing in Postgres, and that process re-reads the row (round 3; #12 and #14's expiry test)                                                                                                                                                                                                  |
| X6            | Removing a circle edge is one `DELETE` by key; an unseen edge is kept (first half)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| X7            | Purge removes the account's rows written elsewhere in all six tables, linked accounts included, and leaves revocations and another account's rows                                                                                                                                                                                                                                                                                                                                                        |
| X7b           | Deleting an account's invitation admissions reaches ones written elsewhere and keeps another account's                                                                                                                                                                                                                                                                                                                                                                                                   |
| X8            | Accepting one applicant declines a sibling the accepting process had not heard of                                                                                                                                                                                                                                                                                                                                                                                                                        |
| X8b           | A second process that had not heard of the first accept accepts another applicant; its gate rolls back, the conflict is counted, both mirrors converge                                                                                                                                                                                                                                                                                                                                                   |
| X8c           | A stale accept of a bounty another process claimed directly accepts and declines nothing                                                                                                                                                                                                                                                                                                                                                                                                                 |
| X9            | A gossip merge and an enqueue keep an envelope they had not heard of; the merge writes the arrival, deletes what it dropped and merges `seen_by`, which Postgres, the writer's mirror and the peer's all hold in the same order                                                                                                                                                                                                                                                                          |
| X10           | A score recompute keeps an argument it had not heard of                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| X11, X11b     | The retention sweep deletes a reply it judged unchanged, keeps one another process changed since, and deletes one whose `updated_at` has microseconds. A reply whose mirror copy has no `updatedAt` is deleted whatever Postgres holds (round 3; #32's `nullMatchesAny`, D5)                                                                                                                                                                                                                             |
| X12           | The pin sweeper deletes an unchanged pin, one with microseconds and one stamped by `DEFAULT NOW()`, and keeps a pin another process rewrote. A pin whose mirror copy has no `updatedAt` is deleted whatever Postgres holds (round 4; #30's `nullMatchesAny`, the same rule as #32's)                                                                                                                                                                                                                     |
| X13, X13b     | A superseded verification token (also one a peer issued) and its sent time survive a restart; the expired-token sweeps judge Postgres's rows. On a process that has not heard of a peer's consume and sent mark, a revoke leaves the consumed token unrevoked and a second sent mark keeps the first `sent_at` (round 3; #41's `consumed_at IS NULL`, #40's `sent_at IS NULL`)                                                                                                                           |
| X14–X16c, X18 | First half: receivers drop gone keys, the fence, in-transaction notification and rollback, a required miss, retry after a lost `COMMIT`                                                                                                                                                                                                                                                                                                                                                                  |
| X16d          | A refresh whose `SELECT` was answered before a queued write committed, and whose reply arrived after the write landed, does not take the write back. Four cases on one process, each recorded and asserted together: a peer's `'u'` naming the logout-everywhere cutoff while a newer cutoff is queued, a `'k'` naming a refresh token while its family's logout is queued, a `'r'` while a sign-out is queued, and the rehydrate after a reconnect while a logout is queued                             |
| X8d           | An accept whose first `COMMIT` reply was lost is retried; the retry's gate misses on the first attempt's own commit and rolls back; the conflict counter does not move, and Postgres and both mirrors hold the accept                                                                                                                                                                                                                                                                                    |
| U4b           | A store boots on PGlite migrated to the latest ordinal minus one (a schema one migration behind), to the ordinal before the migration whose SQL creates `invitation_admissions` (104 today, the same schema), and to 99 (before migration 100). It checks first whether that table is there; where it is not, the method whose only table it is writes the mirror only, and where it is, that method is compiled. The rest are compiled, and a keyed delete and an account deletion still reach Postgres |
| drainWrites   | With a peer refresh's reply held, `drainWrites()` resolves with the queued revocation in Postgres, while `drain()` is still waiting                                                                                                                                                                                                                                                                                                                                                                      |
| map kind      | A mirror map replaced by a `Map` subclass that indexes rows by owner keeps its kind, identity and index through a targeted delete, a `'r'` and a rehydrate                                                                                                                                                                                                                                                                                                                                               |
| X17           | After an account is deleted, neither mirror holds its vault items (including one the deleter had not heard of), link or webhooks; the peer still refuses its token (D1)                                                                                                                                                                                                                                                                                                                                  |
| X19           | A 2,000-row prune announces every key once, in payloads under 8,000 bytes, and the peer converges                                                                                                                                                                                                                                                                                                                                                                                                        |
| U7            | `USER_CASCADE_CHILDREN` with `USER_CASCADE_LEFT_IN_MIRRORS` equals the 21 cascading foreign keys to `users`, and `deleteUser` deletes each child first                                                                                                                                                                                                                                                                                                                                                   |

`packages/api/test/store-spec-coverage.integration.test.ts`:

-   **U1** reads `InMemoryDb` with the TypeScript compiler. Every method that
    writes a mirror map (`set`, `delete` or `clear` on it, or replacing it) has a
    spec naming exactly the maps it writes, or is on the allowlist with a reason;
    no method assigns into a record in place, which the wrapper's capture would
    miss. On `develop`'s code it lists exactly S2 and S3: the four unspecced
    email and reset methods, and the purge's two wrong maps.
-   **U6** calls every targeted mutator on a booted store and checks that the
    keys its wrapper captured equal a before-and-after snapshot of every map. It
    also asserts one U6 call per targeted spec, so a new spec without one fails.

`pg-writer-targeted` (U2, U3, the guard and composite-key tests) and the
first half's tests are described in their commits; `pg-notify-replication`
now asserts that a delete goes out as `'k'` and that nothing sends `'r'`, and
(round 1) that a LISTEN connection raising two errors is replaced once, its
dead client released with an error, only the current connection delivering,
and nothing reconnecting after `close()`. `file-store-temp-snapshots` (round 1)
checks that a file store's boot removes the temp snapshots dead processes left
and keeps a running writer's.

## Mutation checks

Each was run in a scratch `git worktree add --detach` copy of this branch at
`a8edded8ab` (the code after every round's change, with round 3's tests), one
at a time, the copy restored after each run and removed afterwards. Until
round 3 this table held counts from runs made before review round 1, though it
said they were made with the final commit's changes; each "Since" note says
what moved. "Fails" lists the tests that failed; every other test in the files
run passed. Files: X = `store-cross-process` (41 tests), C =
`store-spec-coverage` (2), W = `pg-writer-targeted` (6). PGlite unless marked.

| Mutation                                                                                                  | Files | Result at `a8edded8ab`                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| None (baseline)                                                                                           | X C W | 49 of 49 pass; on PostgreSQL 16.15, X 41 of 41                                                                                                                                                                                                                                                                                                       |
| `develop`'s `src/db` entire                                                                               | X C   | Not comparable with today's tests: X14 (both), X16, X16b, X16d, `drainWrites` and map kind fail, then a test never settles and the other 36 are cancelled. Kept from before round 1, with that code's tests: all 38 fail, many at setup (`develop` ignores `'k'` and lacks the new seams); U1 lists exactly S2 and S3                                |
| `develop`'s `pgDescriptors.ts` on this branch's writer and receivers (before the resync code was removed) | X     | Not comparable with today's tests: 4 pass and the 37 from X16d on are cancelled when a test never settles; on PostgreSQL 16.15 the run had not ended after 900 s and was killed. Kept from before round 1, with that code's tests: 25 of 36 fail, every new X test except X11b, plus X6, X15, both X18, X16c and U7; the same 25 on PostgreSQL 16.15 |
| No self-refresh                                                                                           | X     | 13 fail: X3, X4, X5, X8, X8b, X8c, X9, X11, X12, X13, X17, X15b, self-refresh. Since: X9 (round 1's re-read of a merged row) and X13 (round 3's re-reads)                                                                                                                                                                                            |
| No `'k'` publish                                                                                          | X     | 23 fail: X1, X1b, X2, X3, X4, X6, X7, X7b, X8, X8d, X9, X10, X11, X12, X13, X13b, X15, X16c, X17, X18 (both), X19, self-refresh. Since: X8d (round 1)                                                                                                                                                                                                |
| No guard on #30 and #32                                                                                   | X     | X11, X12                                                                                                                                                                                                                                                                                                                                             |
| Plain equality instead of `date_trunc('milliseconds', …)`                                                 | X     | X11b, X12; the same on PostgreSQL 16.15, where `DEFAULT NOW()` has microseconds                                                                                                                                                                                                                                                                      |
| No `required` on #10                                                                                      | X     | X8b (its conflict count), X8c (its rows), X8d; the same on PostgreSQL 16.15. Since: X8d (round 1)                                                                                                                                                                                                                                                    |
| Mirror keys built by a `:` join                                                                           | X W   | U2, the composite-key test, X14 (both), X6                                                                                                                                                                                                                                                                                                           |
| `'u'`/`'k'` keep a key whose row is gone                                                                  | X     | 16 fail: X1, X1b, X2, X6, X7, X7b, X11, X12, X13b, X14 (both), X16c, X17, X18 (both), X19                                                                                                                                                                                                                                                            |
| No fence                                                                                                  | X     | X16, X16b, X16c, X16d. Since: X16d (round 1)                                                                                                                                                                                                                                                                                                         |
| Notification after commit, with the in-transaction `NOTIFY` failing                                       | X     | X15                                                                                                                                                                                                                                                                                                                                                  |
| Purge's map list as on `develop` (`revokedSessions` for `linkedAccounts`)                                 | X C   | X7, U1, U6                                                                                                                                                                                                                                                                                                                                           |
| Specs #39 to #42 dropped                                                                                  | X C   | X13, X13b, U1, U6                                                                                                                                                                                                                                                                                                                                    |
| The revocation prune ignores expiry                                                                       | X     | X1, X19                                                                                                                                                                                                                                                                                                                                              |
| Account deletion without the explicit child deletes                                                       | X     | X17, U7                                                                                                                                                                                                                                                                                                                                              |
| Revocations among the explicit child deletes (D1 reversed)                                                | X     | X17                                                                                                                                                                                                                                                                                                                                                  |
| A consume without `consumed_at IS NULL`                                                                   | X     | X5                                                                                                                                                                                                                                                                                                                                                   |
| A revoke binding a time other than the mirror's                                                           | X     | X4                                                                                                                                                                                                                                                                                                                                                   |
| The capture does not record `delete`                                                                      | C     | U6                                                                                                                                                                                                                                                                                                                                                   |
| A method assigns into a mirror record in place                                                            | C     | U1                                                                                                                                                                                                                                                                                                                                                   |
| A new method that writes `users` with no spec                                                             | C     | U1                                                                                                                                                                                                                                                                                                                                                   |

The first half's mutations (no transaction, no retry, unkept uncertain keys,
no boot `PREPARE`, an unknown method skipped, no chunking, an unchanged call
queued, a wrapper that throws, and the receiver mutations) are in its commit
messages; four of them are in the table above (`:` join, absent rows kept, no
fence, notification after commit), re-run at `a8edded8ab`.

After review round 1, each round-1 change was mutated in place in this
worktree, one at a time, and the file restored from a copy afterwards
(`git diff` clean). N = `pg-notify-replication`, F = `file-store-temp-snapshots`.

| Mutation (round 1)                                                             | Files | Result                                                                                        |
| ------------------------------------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------- |
| `refreshKeys` without the fence taken when its `SELECT` is sent                | X     | X16d: its `'u'` case (the cutoff moved back an hour) and its `'k'` case; X16, X16b, X16c pass |
| `reloadTable` without it                                                       | X     | X16d: its `'r'` and rehydrate cases                                                           |
| `drainWrites` also awaits the apply chain (what `flushRuntimeStoreWrites` did) | X     | the `drainWrites` test: `'waiting'` where `'done'` was expected                               |
| A missing table refuses the boot again                                         | X     | U4b, with the message the reviewer saw; U4 passes                                             |
| Every gate miss counted as a conflict                                          | X     | X8d (the counter moved); X8, X8b, X8c pass                                                    |
| No re-read of a merged row                                                     | X     | X9, on the writer's mirror (`['n0', 'nA']`)                                                   |
| The `SELECT DISTINCT` union                                                    | X     | X9, on Postgres's order                                                                       |
| The capture calls `Map.prototype.delete`                                       | X     | map kind: the index was not kept current                                                      |
| A reload replaces every map                                                    | X     | map kind: `'r'` did not keep the same map                                                     |
| `pgNotify.ts` as before round 1                                                | N     | the reconnect test: 3 connections where 2 were expected                                       |
| No temp-snapshot cleanup at boot; or no check that the writer is running       | F     | "a dead process left it"; "a running process may be writing it"                               |

After review round 2, U4b alone was run in this worktree with a migration 106
copied into `src/db/migrations` and removed afterwards (`git status` clean
after each run). "v46's 106" is `106_deadman_releases.up.sql` and `.down.sql`
from `215eff7c6d`.

| Mutation (round 2)                                                           | Files | Result                                                                                                         |
| ---------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| U4b as before round 2 (the latest ordinal minus one), with a no-op 106 added | X     | U4b fails: "105: its only table (migration 105) is not there, so it writes the mirror only", `true !== false`  |
| The same, with v46's 106 added                                               | X     | the same failure                                                                                               |
| U4b after round 2, with either 106 added                                     | X     | passes; it boots 105, 104 and 99                                                                               |
| A missing table refuses the boot again (round 1's mutation, on the new U4b)  | X     | U4b fails: "MUTATOR_SPECS.deleteInvitationAdmissionsForUser step 1 (deleteWhere on invitationAdmissions): ..." |

After review round 3, the predicates of finding 4 were each removed alone in
a scratch `git worktree add --detach` copy, restored after each run and
removed afterwards. "Before" is `a0f6012736` (X and C); "after" is the same
code with `b2ba8803c7`'s tests (X), on PGlite and on PostgreSQL 16.15.

| Predicate removed                                                        | Before        | After (PGlite and PostgreSQL 16.15, the same)                                                     |
| ------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------- |
| None (baseline)                                                          | X C 43 of 43  | X 41 of 41                                                                                        |
| #41 `revokeEmailVerificationTokensForUser`: `consumed_at IS NULL`        | 43 of 43 pass | X13 alone fails: "a consumed token is not superseded" (`'superseded'` where `null` was expected)  |
| #40 `markEmailVerificationTokenSent`: `sent_at IS NULL`                  | 43 of 43 pass | X13 alone fails: "Postgres keeps the first sent_at" (the second process's later time was written) |
| #12 `consumePendingOAuthLink`: `AND expires_at > $2`                     | 43 of 43 pass | X5 alone fails: "consumePendingOAuthLink: Postgres records no consume"                            |
| #14 `consumePendingOidcLogin`: `AND expires_at > $2` (not in the review) | 43 of 43 pass | X5 alone fails: "consumePendingOidcLogin: Postgres records no consume"                            |
| #32 the retention sweep's guard: `nullMatchesAny`                        | 43 of 43 pass | X11 alone fails: the reply is still in Postgres (1 where 0 was expected)                          |
| #30 the pin sweeper's guard: `nullMatchesAny` (round 4, see below)       | 49 of 49 pass | X12 alone fails: "a pin whose copy has no updatedAt is deleted" (1 where 0 was expected)          |

## Gates

Run in `packages/api` (Node 22.22.0, pnpm 9.15.4). "C6" is the commit that
removed the resync, run before this record was added to it; "C7" is the
commit after it, which fixed the file store's temp-file race (O13); "R1" is
`b828f7f244`, the last code commit after review round 1 (this record's commit
changes only documents); "R2" is `beeaa6556c`, after review round 2, whose
`src` is R1's (`git diff b828f7f244 beeaa6556c -- packages/api/src` is empty;
round 2 changed U4b and documents; `265f430fdb` after it changes one comment in
the single-server compose file); "R3m" is `a0f6012736`, the merge of `develop`
at `f6da7b7d16`; "R3" is `a8edded8ab`, after review round 3 (its tests and
comments; this record's commit changes only the record); "R4" is
`3f4a6752f2`, after review round 4 (its gates are in its commit message); "P"
is `51a37fa8b9`, the merge of `develop` at `7bda9eb72a`, run before this
record's publication commit (`e30c6d5c4f`), which changes only this record;
"P2" is `f2054bd111`, the merge of `develop` at `27d8c17051`, run before the
commit after it, which changes only this record:

| Gate                                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `pnpm typecheck`                                            | clean (C6, C7, R1, R2, R3m, R3, P, P2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm test:integration` (CI's PR gate)                                   | C6: 2014 of 2015, three runs; each time the one failure was a `streaming-module` test hit by the file store's temp-file race (O13). C7: 2015 of 2015. R1: 2022 of 2022 (5 min 20 s). R2: 2022 of 2022 (5 min 25 s); U4b among them. R3m: 2022 of 2022 (5 min 57 s). R3: 2022 of 2022 (5 min 29 s). The merge changes no API count: `develop`'s new tests are in the client (Vitest) and the Synapse fork (Python), which no API gate runs, and it changed only `packages/api/package.json` (`@hono/node-server` 2.1.3) in the API; round 3 adds assertions to X5, X11 and X13, not tests. P: 2022 of 2022 (5 min 39 s). P2: 2022 of 2022 (4 min 43 s)                        |
| `pnpm test` (post-merge, `--test-force-exit`)                            | TAP, C6 and C7 alike: tests 2135, pass 2135, fail 0, cancelled 0; all 23 tests that `cbce376602`, `111eabe39e` and `c30077a925` add appear in it (2112 before them). R1: tests 2142, pass 2142, fail 0, cancelled 0; the 7 tests round 1 adds appear in it and in `test:integration`. R2: tests 2142, pass 2142, fail 0, cancelled 0 (13 min); U4b among them. R3m: tests 2142, pass 2142, fail 0, cancelled 0 (12 min 13 s). R3: tests 2142, pass 2142, fail 0, cancelled 0 (12 min 27 s). P: tests 2142, pass 2142, fail 0, cancelled 0 (9 min 57 s). P2: tests 2142, pass 2142, fail 0, cancelled 0 (9 min 19 s)                                                          |
| `pnpm test:launch-smoke`                                                 | C6, C7, R1, R2, R3m, R3, P and P2: 14 of 14                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `store-cross-process` on PostgreSQL 16.15 (loopback)                     | C6: 36 of 36, three runs; C7, with `store-spec-coverage`: 38 of 38 (the coverage file's U6 boots on PGlite either way). R1, the same two files: 43 of 43. Every per-test and template database dropped afterwards (0 left). R2, the same two files: 43 of 43, 0 databases left (U4b boots on PGlite in either mode). R3m and R3, the same two files: 43 of 43 each, 0 databases left. P, the same two files: 43 of 43 (1 min 10 s), 0 databases left (3 before, 3 after: `postgres` and the two templates); the throwaway cluster was removed afterwards. P2, the same two files: 43 of 43 (1 min 6 s), 0 databases left (3 before, 3 after), the cluster removed afterwards |
| the store's test files on PGlite (mutation baseline)                     | `store-cross-process`, `store-spec-coverage` and `pg-writer-targeted`: 44 of 44 (C7). R1, seven files run together: 59 of 59 (`store-cross-process` 41, `store-spec-coverage` 2, `pg-writer-targeted` 6, `postgres-store` 4, `pg-notify-replication` 3, `write-behind-durability` 2, `file-store-temp-snapshots` 1). R3, `store-cross-process`, `store-spec-coverage` and `pg-writer-targeted`: 49 of 49 (41, 2 and 6). P, the same three files: 49 of 49 (1 min 26 s). P2, the same three files: 49 of 49 (1 min 23 s)                                                                                                                                                      |
| the reviewer's harnesses at R1 (`verify-concurrency-1`, not in the tree) | `attack.mts`: hub on PGlite 10 pass, 0 fail (A7 needs real Postgres); PostgreSQL 16.15 9 pass, 2 fail, A7 (O15) and A9 (the boot gap, O4). `natural.mts` N1: 0 of 1,000 logouts lost in four runs; N2: three runs, one listen error and one reconnect each, no LISTEN session left, 0 lost                                                                                                                                                                                                                                                                                                                                                                                   |
| root `pnpm exec prettier --check` on the changed files                   | clean (P: the 24 files changed against `develop` at `7bda9eb72a`; P2 and the commit after it: the same 24 files against `27d8c17051`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| gitleaks 8.21.2 over `origin/develop..HEAD`                              | P: 26 commits scanned (merges skipped), no leaks. P2: 27 commits, no leaks; the commit after it: 28, no leaks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

The earlier commits' gates are in their messages: `test:integration` 2003 of
2003 after the auth tables, and 2010 of 2010 after the bounty, sweeper, mesh
and coliseum conversions.

## Cost

One prune of 1,100 revocations (100 expired), and one family revoke among
1,100 refresh tokens (2 in the family), from the call until the queue drained,
on PGlite with the in-process transport, three runs each:

| Tree                   | Prune                           | Family revoke                   |
| ---------------------- | ------------------------------- | ------------------------------- |
| `develop` `ff7d08bfa0` | 532 to 676 ms, 1,101 statements | 604 to 733 ms, 1,101 statements |
| this branch            | 3.0 to 7.1 ms, 3 statements     | 1.9 to 18.4 ms, 3 statements    |

The three statements are `BEGIN`, the `DELETE` or `UPDATE`, and `COMMIT`; with
the Postgres transport each op also sends its `NOTIFY`s inside the
transaction. Both leave 1,000 rows. The design lens measured 728 ms against
5 ms for the same prune on its prototype.

## What it leaves open

-   **O1 — check-then-act across processes.** Inside the window before a process
    hears of another's change, each of these is still accepted once on each
    process: a single-use token (reset, verification, deletion, OAuth state,
    OIDC state), a refresh-token rotation, an invitation admission, a bounty
    accept. For the targeted ones (the five consumes, the bounty accept)
    Postgres keeps the first writer and the loser's mirror re-reads (X5, X8b); a
    rotation and an admission are upserts, where the last writer wins (O3).
    Either way the second request has already succeeded. Closing it needs
    awaited conditional writes (PR 3, not built).
-   **O2 — a family revoke against an in-flight rotation on another process.**
    Under READ COMMITTED the revoke waits on the rotation's row lock and then
    changes nothing, so the new successor stays live (run on PostgreSQL 16.15 by
    the design). A family advisory lock in both writers fixes it (PR 3).
-   **O3 — the upsert siblings.** 220 specs are still whole-row upserts, and
    the last writer wins. On the security tables that means a stale
    `markUserEmailVerified` can revert a password change, a stale
    `updateUserPassword` can re-insert a deleted account, a stale moderation
    call can overwrite a rejection, and a stale vault update can bring back old
    ciphertext, each inside the window. PR 2 (sticky revocation and consumption
    columns, patch and insert-only kinds) closes those; it is a separate
    change, not in this one. Others to review after it: voice-room sanctions,
    moderation actions, marketplace entitlements, creator stream auth, canary
    tokens, dead-man switches, scheduled messages and release identities.
    An upsert writes the record its method returned whenever that is an
    object (`installWriteThrough`), so a call that changes nothing still
    rewrites its row, whole, from the calling process's copy. A scan of
    `InMemoryDb` for upsert methods that can return a record read from a
    mirror map without writing it (round 3, Read; the scan looks for that
    one shape, so it may miss others) finds 11, all PR 2 candidates:
    `markUserEmailVerified` (an already-verified account: the row is
    rewritten, `password_hash` included), `consumeRefreshTokenForRotation`
    (a token already rotated or revoked), `revokeInvitationToken`,
    `markBurnerIdentityBurned`, `markCoalitionNotificationRead` (each when
    already done), `markGreeted`, `markBillingWebhookEventProcessed`,
    `addCircleEdge` (each when the row exists), `openDeadDrop` (a drop
    already opened), `joinVoiceRoom` (an active participant) and
    `applyVoiceRoomSanction` (a standing sanction).
-   **O4 — the rest of M11's stale-read gaps.** An upsert's notification is
    still sent after commit, fire-and-forget, on another connection; the gap
    between hydrating and `LISTEN` at boot is still open; a half-open listener
    is not noticed, since only an `error` event triggers recovery; and writes
    made before `init` are dropped. A process that misses a change this way is
    not in a window that closes by itself: it keeps the old row until it
    restarts or re-reads it (a later change to the same row, or a replaced
    listening connection). A sign-out is such a change. `revokeSession` is an
    upsert, so a process that boots during it, or misses its notification,
    accepts the signed-out access token until the token expires, up to 24 hours.
    The boot gap is measurable: the reviewer's harness (`attack.mts` A9, run
    again on this branch at R1 on PostgreSQL 16.15) booted a process while
    another recorded 425 sign-outs, and the new process missed 229 of them. The
    reviewer's `bootgap.mts` (round 1, PostgreSQL 16.15, five boots each) timed
    the gap from hydrating `revoked_sessions` to `LISTEN` at 278 to 365 ms at
    `a1696d1609` and 272 to 359 ms on `develop`, so it was there before. After
    review round 2, `KNOWN_LIMITATIONS.md`, both deploy comments and the M11
    note say this; before, they described only the window. After review
    round 3, so do the store's header in `store.ts`, `pgNotify.ts`'s header
    and the production refusal in `src/index.ts`, which had still called the
    store eventually consistent.
-   **O5 — account deletion fails for an account with messages, votes or tips.**
    Those foreign keys do not cascade, so the `DELETE` fails, the whole op rolls
    back (now including the explicit child deletes) and the failure is counted.
    The mirror has dropped the account and a restart brings it back. This was so
    before.
-   **O6 — a deleted account's access token** stays valid on other processes
    until it expires, up to 24 hours: the denylist row for the token used to
    confirm the deletion cannot be written once the account is gone (S8), and
    the auth middleware does not check that the account exists. Before, too.
    D1 keeps the account's earlier revocations refused in the running mirrors.
-   **O7 — rolling deploys.** A process on the old code still resyncs whole
    tables, and does not understand `'k'`, so until every process runs this
    release the defect is live wherever an old one runs.
-   **O8 — the four unspecced writers (S7).** Closing a governance vote
    (`resolveVote`), an aid post mirrored from FreeBlackMarket
    (`upsertCoalitionAidPostByOrigin`), and campaign attribution and engagement
    (`upsertCampaignAttribution`, `upsertCampaignEngagement`) change the mirror
    and nothing else in Postgres mode: no other process sees them and a restart
    loses them. U1 found them; it lists them as known gaps so that any new one
    fails the test. Giving each a spec needs its own review:
    `coalition_campaign_attribution`'s conflict key includes a nullable column,
    which `ON CONFLICT` never matches when it is `NULL`.
-   **O9 — `'r'` is still received.** Drop the receiver one release after every
    process runs this one (the design's commit 7).
-   **O10 — a key value of the wrong type fails the whole op.** A predicate on a
    `uuid` column given a string that is not a uuid makes Postgres reject the
    statement, so the op rolls back and is counted as lost. Every account id the
    API mints for a person is a uuid (`crypto.randomUUID()` in the three routes
    that create users). The one exception is the demo seed: `InMemoryDb`'s
    constructor creates the user `demo-user` in every process outside
    production, and in production when `BLACKOUT_DEMO_PASSWORD` is set,
    `PostgresBackedDb` mirrors included. `deleteUser('demo-user')` or
    `purgeUserAuthArtifacts('demo-user')` now fails on the uuid cast and is
    counted as a lost write. That user never reached Postgres on `develop`
    either (`users.id` is a uuid, so its upsert failed), so its ops fail loudly
    now where its writes always failed.
-   **O11 — no test isolates the apply chain's order.** The receiver also re-reads
    a key whose mirror value changed while its `SELECT` was in flight, which makes
    out-of-order refreshes converge without the FIFO chain (commit 2).
-   **O12 — evidence.** The store code ran on PGlite and on a throwaway
    PostgreSQL 16.15 on loopback. No production deployment was examined, nothing
    ran under a transaction-mode pooler, and CI has no real-Postgres job for these
    tests.
-   **O13 — a test flake outside the Postgres store, fixed.** The file store
    wrote every snapshot through one fixed temporary name (`store.json.tmp`),
    so two test files using the default file store, run in parallel, raced on
    it: one got `ENOENT` on the rename and answered 500. Adding
    `store-spec-coverage` put the four `streaming-*` files side by side under
    `test:integration`, and one of their tests failed in each of three runs.
    The same four files run in parallel fail on `develop` too, one to four
    tests a run depending on timing: the reviewer saw 1 of 27 in each of two
    runs on `develop` (`ENOENT` 4 and 2 times), and this branch before the
    change failed 4, 2 and 4 in three runs. So the race was there before. (This
    record first said "3 tests in every run on `develop`", which no saved run
    shows.) The temp name now carries the process id (as
    `cleanCoalitionDemoSeed` already did), and none of 27 failed in three runs
    after it, nor in two by the reviewer.
-   **O14 — a failed `NOTIFY` now fails the write.** The notification is sent
    inside the write's transaction, so if Postgres refuses it the write rolls
    back, is retried, and is counted as lost, and the mirror is left ahead of
    Postgres. On `develop` the same failure lost only the notification. Two
    causes: a payload of 8,000 bytes or more (`keyChangePayloads` splits keys
    across payloads, but sends a single key too large for any payload alone),
    and a full notification queue. Today's keys are short (uuids, hashes; mesh
    ids are capped at 200 characters by `routes/mesh.ts`), so no reachable
    case was found (Read).
-   **O15 — a child row inserted while an account deletion runs.** Under READ
    COMMITTED, a refresh token or vault item another process inserts for the
    account after `deleteUser`'s DELETE on that child table has run, and before
    its DELETE of the account, is removed by the cascade alone, which tells no
    one. That process's mirror keeps the row, and so does the deleting one's if
    it had heard of the insert. Run by the reviewer on PostgreSQL 16.15
    (`attack.mts` A7, holding the reply to the child DELETE while the other
    process inserted): no token or account in Postgres, the token in both
    mirrors; run again on this branch's tip, the same. Such a refresh token is
    refused: `/token/refresh` answers 401 when its account does not exist, so
    no access token is issued (`routes/auth.ts`). Locking the account row first (`SELECT … FOR UPDATE`,
    which a child insert's foreign-key check waits on) was considered and not
    built: the inserting process's write would then wait, fail on the foreign
    key and be counted as lost, and a failed upsert is not re-read, so that
    process's mirror would keep the row anyway. The lock would keep the row
    out of the deleting process's mirror only, at the cost of a new statement
    form in this change.
-   **O16 — the file store is single-writer.** Its temp file is per process
    (O13), which stops two writers renaming each other's temp file away, but
    two processes on one store file still overwrite each other's snapshots.
    A temp snapshot a crashed process left is removed at the next boot unless
    that process is still running (round 1). The API refuses file mode in
    production (`src/index.ts`, `src/backgroundWorker.ts`).

## For the operator

Nothing here was decided by this work, and no flag or environment switch was
set in any committed file. The decisions the operator has since taken are dated
under "Disclosure"; the deploy steps they lead to are under "After upgrading".

1. **Interim mitigation, before this ships.** Setting `BLACKOUT_AUTH_ROWS_PRUNE=0`
   on the process that runs the background loops removes the one request-less
   trigger on the security tables: the hourly prune that resyncs
   `revoked_sessions` (`packages/api/src/backgroundLoops.ts`; the prune was
   added in `053778f728` on 2026-10-26). The retention sweep and, with the FBM
   bridge on, the pin sweeper still resync their tables with no request (S1);
   neither is a security table. Expiry is checked on read, so the only cost is
   that the three tables grow; the code says the prune "discharges an
   obligation, not a feature".
   This work set it nowhere. The operator set it in production on 2026-11-02.
   The worker was a separate process from the API on the same database until
   2026-11-08; from then until the fix is deployed, production runs as one
   process ("Disclosure"). Both measures end with the deploy ("After
   upgrading").
2. **Rollout.** A process on the old code ignores `'k'`. Either ship two
   releases (A: commits 1 to 3 of this branch's first half, the receivers, to
   every process; B: the rest), or ship one with a full stop: stop the worker,
   replace every API replica with no canary overlay, then start the worker.
   Until every process runs B, an old one still resyncs (O7). Release A must
   end at `0ca48db41b`, not `2f5b92a5a1`: `2f5b92a5a1` alone fails its own
   `write-behind-durability` test (computing an upsert's fence key from a
   descriptor with no `keyOf` throws; `0ca48db41b` fixes it), so it is not
   bisect-safe. Likewise `c30077a925` alone carries the file store's temp-name
   race (O13), which failed one `test:integration` test in each of three runs
   until `a1696d1609`. The round-1 receiver fixes change nothing a process
   sends, and they sit after B's commits on this branch, so putting one in A
   means cherry-picking it. Checked against `0ca48db41b` (round 3), they do
   not all apply to A as it stands:

    - `b0b5bfbd32` (the fence taken when a refresh starts): its `store.ts`
      change applies cleanly; its test (X16d) does not, against A's test
      file.
    - `b28fc592ad` (one LISTEN reconnect): applies cleanly, with its test.
    - `0cd7b9ab75` (a map's kind kept) does not apply. Its capture half
      changes `captureWrites`, which `60203eb3a4` adds in B, so it conflicts
      there. Its reload half applies cleanly but changes nothing in A, where
      every mirror map is a plain `Map`; it matters only once v46's
      `GroupedMap`s are merged (decision 4 (a)). It belongs with B.

    With `b0b5bfbd32`'s `store.ts` change and `b28fc592ad` applied to
    `0ca48db41b` in a scratch worktree, `pnpm typecheck` and `eslint` on the
    changed files were clean, and A's five store test files
    (`store-cross-process`, `pg-notify-replication`, `postgres-store`,
    `write-behind-durability`, `pg-writer-targeted`) passed, 18 of 18 on
    PGlite.

3. **Past losses.** Nothing records which rows were lost. Either accept that a
   revoked access token a resync brought back expires on its own within 24
   hours of the fix shipping, or rotate the JWT signing key at deploy, which
   ends every access token at once. "After upgrading" gives the rotation as
   the recommended step, with what else it touches; no decision on this is
   recorded under "Disclosure". Separately: whether to tell users beyond the
   advisory ("Disclosure").
4. **Order with v46.** The unmerged v46 branch (`215eff7c6d` or later; the
   branch moves, so re-run `git merge-tree` before merging) also
   changes `pgWriter.ts`, `writeBehindQueue.ts`, `pgDescriptors.ts` and
   `store.ts`, and adds migration 106. `git merge-tree --write-tree` of this
   branch's tip with it reports conflicts in exactly those four files (the
   reviewer's run on `a1696d1609` found 2 hunks in `pgDescriptors.ts`, 1 in
   `pgWriter.ts`, 3 in `store.ts` and 3 in `writeBehindQueue.ts`);
   `KNOWN_LIMITATIONS.md` and the postgres-store test merge cleanly. During
   round 3 v46 moved twice. At `dbc50a2ae5` (111 commits on `ff7d08bfa0`),
   `git merge-tree` with this branch after its merge of `develop` reported the
   same four files and the same hunk counts; at `9fffb126a5` (117 commits), the
   same four files, with 4 hunks in `store.ts` where there had been 3. The
   other two files merged cleanly both times.
   Whichever lands second must also handle five overlaps outside the
   conflict hunks, which git will not flag:

    - **(a)** v46 makes four maps `GroupedMap`s (an indexed `Map` subclass)
      and reloads them with `freshMapLike`. This branch's `reloadTable` now
      updates a non-plain map in place through its own methods (round 1), so
      a reload keeps them indexed; check it against v46's
      `deadman-releases-postgres` test, which rehydrates and lists by group.
    - **(b)** The write capture now calls a map's own `set`/`delete`/`clear`
      (round 1), so it keeps a `GroupedMap`'s index current if a targeted spec
      ever writes one.
    - **(c)** `enqueueUpsert` must carry v46's `guard` and `insertOnly` as well
      as this branch's fence key. A guarded or insert-only upsert Postgres
      refuses leaves the writer's own mirror ahead of Postgres, and nothing
      re-reads it.
    - **(d)** v46's `endDeadmanReleaseNoticesOfDeletedAccount` awaits
      `drain()`, which on this branch also waits for the apply chain; if it
      needs only durability, `drainWrites()` is the call.
    - **(e)** U4b booted "the latest migration minus one" as the schema
      without `invitation_admissions` (migration 105). v46's migration 106
      would have made that 105, where the table exists, and U4b would have
      failed in `test:integration` and `pnpm test` whichever branch landed
      first. Handled here (round 2): U4b finds the migration that creates the
      table by its SQL. With v46's two `106_deadman_releases` files copied in,
      U4b boots 105, 104 and 99 and passes.

    Migration 106 adds no foreign key to `users`, so U7 is unaffected.

5. **Scope of what follows.** Approve PR 2 (about 60 spec changes on the
   security tables, O3) and schedule PR 3 (awaited conditional writes for
   consumes and rotation, O1 and O2; it adds one awaited Postgres round trip to
   the refresh, consume and logout routes).
6. **The deleted account's token (O6).** Relax `revoked_sessions.user_id`'s
   foreign key (a migration), or have the auth middleware refuse a token whose
   account no longer exists (no migration).
7. **CI.** Whether to add a real-Postgres job for `store-cross-process`; the API
   suite has none today.
8. **New: the four unspecced writers (O8),** and whether D1 (revocations left in
   running mirrors after an account is deleted) is the behaviour wanted.

## After upgrading

For an operator deploying the release that carries this change. Each step says
what it rests on; none of it is set by this change. Steps 1 and 2 are the
rotation that decision 3 recommends; steps 3 to 5 deploy and then end the
interim measures dated under "Disclosure".

1. **Set `BLACKOUT_ATTRIBUTION_SECRET` first, if it is unset** (needed only
   with step 2). The `ref` on a shared campaign link is signed with
   `BLACKOUT_ATTRIBUTION_SECRET` or, when that is unset, with
   `JWT_SECRET_PRIMARY` (`services/coalitionAttribution.ts`, `signingKey`;
   `.env.example`). A
   deployment without it would lose, at step 2, every `ref` minted before the
   rotation: each becomes a visit with no known source, and nothing else fails
   (`recordAttributedAction`). Set it to the current `JWT_SECRET_PRIMARY` to
   keep those links attributed (a `ref` is honoured for 90 days), or to a new
   value to let them lapse; either way the attribution key no longer moves with
   the session key.
2. **Rotate `JWT_SECRET_PRIMARY`, and do not put the old value in
   `JWT_SECRET_ROLLOVER`** (recommended; decision 3). An access token is
   verified against the primary secret and the rollover list
   (`services/auth.ts`, `readAuthRuntimeConfig`
   and `verifyJwt`), so with the old value in neither, every access token
   signed before the rotation is refused at once, including any revoked token a
   resync brought back (decision 3: whether there was one is unknown). Access
   tokens live up to 24 hours (`signJwt`). Refresh tokens are random strings
   kept in `refresh_tokens`, not JWTs (`services/refreshToken.ts`), and
   `/token/refresh` takes only the refresh token (`routes/auth.ts`), so a
   signed-in client gets a new access token at its next refresh without signing
   in again; a client whose refresh token a resync deleted signs in again. The
   rotation does not touch the read-side gaps (O4): a process that misses a
   later sign-out still accepts that token until it expires. An operator who
   instead accepts that a revived token expires on its own within 24 hours of
   the deploy (decision 3) skips steps 1 and 2.
3. **Deploy by hand, with a full stop.** Stop every process on the old code,
   the worker and every API replica, before starting any on the new code, so
   old and new store code never run side by side: an old process still resyncs
   whole tables and ignores `'k'` (O7, decision 2). No canary overlay and no
   rolling replacement. With production on one process ("Disclosure"), that is
   one process stopped and one started, with the server's
   `docker-compose.override.yml` and `BLACKOUT_AUTH_ROWS_PRUNE=0` still in
   place. The `canary` job of `.github/workflows/deploy-compose-prod.yml`
   starts `app_canary` beside `app`, so it does not fit. That job and
   `full-rollout` also sync `deploy/docker/production/` to the server with
   `rsync --delete`, which replaces the server's `Caddyfile` and removes every
   file there that the repository does not have and the sync does not
   exclude, the override among them; and both run
   `docker compose -f docker-compose.yml`, which reads no override file. If
   this deploys before the fix for `POST /v1/auth/register` ("Disclosure"),
   such a sync lifts the proxy's `503` on that route once the proxy reloads or
   its container is recreated; put it back. The change adds no migration.
4. **Then end this change's interim measures.** Once the new process serves,
   delete the line `BLACKOUT_AUTH_ROWS_PRUNE=0` from the server's
   `.env.production`, delete the server's `docker-compose.override.yml`, and
   run `docker compose up -d` in the stack directory: the app is recreated
   with `BLACKOUT_BACKGROUND_WORKERS_DISABLED` `'1'` from the compose file
   again, and the `worker` starts and runs the background loops, both on the
   new code. Restore any other replicas. With
   every process on the new code the prune is
   `DELETE FROM revoked_sessions WHERE expires_at <= $1` (#9), so the three
   tables it keeps stop growing; until then expiry is checked on read, and
   nothing is lost by the prune's absence.
5. **The proxy's `503` on `POST /v1/auth/register` is not part of this
   change.** It is the interim measure for a separate fix to that route, and
   comes off when that fix is deployed, by that fix's own steps; leave it in
   place until then.

## The other findings

-   **S2.** `markEmailVerificationTokenSent`, `revokeEmailVerificationTokensForUser`,
    `deleteExpiredPasswordResetTokens` and `deleteExpiredEmailVerificationTokens`
    had no spec, so their change reached Postgres only if a later resync of
    the same table happened to rewrite it (a later
    `consumeEmailVerificationToken` resynced `emailVerificationTokens`, which
    upserted every mirror record). Otherwise a restart lost it: a superseded
    verification token was consumable again, and the sent time (which the
    resend cooldown reads) was gone. They are #39 to #42 above.
-   **S3.** The purge's spec named `revokedSessions`, which the method never
    writes, so a purge on one process deleted every revocation it had not heard
    of, and it omitted `linkedAccounts`, which the method does write, so the
    account's links stayed in Postgres. #6 above; U1 now catches either kind of
    mismatch for every spec.
-   **S4.** `resyncMap` built a row's mirror key as its key columns joined with
    `:`. `circleEdges` keys on `a::b`, so a resync of that table never matched a
    key: it deleted every edge in the table and re-inserted only the remover's
    own. Keys are now built through each descriptor's own `keyOf` (U2).
-   **S5.** The queue published after the write, on a separate connection, fire
    and forget, so a failed publish left peers stale, and nothing tied the
    notification to the commit. A targeted op now notifies inside its
    transaction. Upserts still notify after commit (O4).
-   **S6.** A peer's `'u'` refresh set the row if found and otherwise did
    nothing, so a deleted row stayed in every peer until a table reload. A
    `'u'` or `'k'` now removes a key whose row is gone (X14).
-   **S7 and S8** are open: O8 and O6 above.
-   **S9 (round 1, pre-existing).** A dropped LISTEN connection raises `error`
    more than once: with one `pg_terminate_backend` on PostgreSQL 16.15, the
    reviewer saw "terminating connection due to administrator command" and
    then "Connection terminated unexpectedly". Each scheduled its own
    reconnect, so the transport opened two LISTEN connections: every
    notification arrived twice, two full rehydrates ran, `close()` released
    only the second, and `pool.end()` hung on the first (`pg_stat_activity`
    still showed it listening four minutes after shutdown). The transport now
    counts only its current connection, releases a dead one with its error,
    and keeps at most one reconnect pending (`pg-notify-replication`). The
    reviewer's `natural.mts` N2, run again on this branch's tip three times:
    one listen error and one reconnect each time, no LISTEN session left
    afterwards, and the run ends; it hung before.

## Changed after review round 1

The review ran at `a1696d1609`: concurrency probes on PGlite and PostgreSQL
16.15, a completeness check against the design, and a regression pass. Each
finding was checked here first. Finding numbers are the review's.

| #      | Finding                                                                                                                                                                                                           | Now                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | High. The fence was checked when a refresh applied its reply, not when it started; a write that committed in between was overwritten in its own process's mirror (a logout taken back there, a cutoff moved back) | Fixed (`b0b5bfbd32`). X16d. The reviewer's `attack.mts` A1, A2 and A2b now pass on PGlite and PostgreSQL 16.15; `natural.mts` N1 lost 0 of 1,000 logouts in each of four runs (it lost 1 of 300, then 0, 8 and 1 of 1,000)                                                   |
| 2, 13  | `flushRuntimeStoreWrites` also waited for peer reloads and rehydrates on the apply chain                                                                                                                          | Fixed (`7b94aa8344`): it awaits `drainWrites()`. On PostgreSQL 16.15 against 50,000 revocations, one queued write: `drainWrites()` 2.5 to 2.7 ms alone, 23 to 47 ms with a reload queued, 2.7 to 6.2 ms with a rehydrate; `drain()` 2.5 to 3.7, 416 to 439 and 390 to 445 ms |
| 3      | A gate miss after a lost `COMMIT` reply was counted as a conflict                                                                                                                                                 | Fixed (`0e712a9b7e`): logged, not counted. X8d                                                                                                                                                                                                                               |
| 4      | The writer never re-read the `seen_by` Postgres merged; `DISTINCT` lost order                                                                                                                                     | Fixed (`551a39043b`). X9 compares unsorted                                                                                                                                                                                                                                   |
| 5      | A child row a peer inserts during `deleteUser` is cascaded unannounced                                                                                                                                            | Not changed in code; the claim is qualified (row 1, O15, `KNOWN_LIMITATIONS.md`, the `USER_CASCADE_CHILDREN` comment), with why no lock was added                                                                                                                            |
| 6      | One dropped LISTEN connection was replaced twice and leaked (pre-existing)                                                                                                                                        | Fixed (`b28fc592ad`), S9                                                                                                                                                                                                                                                     |
| 7, 8   | The Helm chart said write-through and multi-replica safe; three headers said write-through                                                                                                                        | Corrected (`b828f7f244`), with two more of the same kind (Documents corrected)                                                                                                                                                                                               |
| 9      | S2 said the four methods never reached Postgres                                                                                                                                                                   | Corrected (S2)                                                                                                                                                                                                                                                               |
| 10     | O10 missed the demo seed user                                                                                                                                                                                     | Corrected (O10)                                                                                                                                                                                                                                                              |
| 11, 19 | `c30077a925` and `2f5b92a5a1` are not green alone                                                                                                                                                                 | Recorded (decision 2). No commit was rewritten                                                                                                                                                                                                                               |
| 12     | Medium. `init` refused to boot on a schema one migration behind, which `develop` booted on                                                                                                                        | Fixed (`2efb0ffeab`): a step on a missing table is left out and logged. U4b. Booted on PGlite at 13 ordinals from 105 down to 5                                                                                                                                              |
| 14     | Overlaps with v46 outside the conflict hunks                                                                                                                                                                      | (a) and (b) handled here (`0cd7b9ab75`, map kind test); all four in decision 4                                                                                                                                                                                               |
| 15     | A failed in-transaction `NOTIFY` now fails the write                                                                                                                                                              | Recorded (O14)                                                                                                                                                                                                                                                               |
| 16     | `KNOWN_LIMITATIONS.md` said only other tables replace whole rows                                                                                                                                                  | Corrected                                                                                                                                                                                                                                                                    |
| 17     | O13's "3 tests in every run on `develop`" was not reproduced                                                                                                                                                      | Corrected (O13)                                                                                                                                                                                                                                                              |
| 18     | A crash left a per-pid temp snapshot nothing removes; the file store is still single-writer                                                                                                                       | Fixed (`f80b923e4d`): removed at the next boot unless its writer runs. O16                                                                                                                                                                                                   |

No finding was rejected. For 5 the code was left as it is and the claim
qualified, for the reason in O15.

## Changed after review round 2

The second review ran at `baa7a1d593`: completeness against the design and the
code, and a regression pass (every API gate in scratch worktrees, the test
count against `ff7d08bfa0`, the mutation checks re-run, single-process
behaviour, the overlap with v46). It found two medium findings. Each was
checked here first; both were real.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                 | Now                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium. `KNOWN_LIMITATIONS.md` described a stale copy as a window that ends when the notification arrives, and left out the design's §8.4 (the boot gap, an upsert's notification sent after commit, a half-open listener, writes before `init`). For a missed notification it never arrives: a sign-out missed there is accepted until the token expires. Both deploy comments said the same; the M11 note covered only the write side | Corrected (`beeaa6556c`): a `KNOWN_LIMITATIONS.md` bullet with the sign-out example and A9's 229 of 425; the Kubernetes and Helm comments; one passage in the M11 note; O4. The single-server compose file made the same claim and was corrected too (`265f430fdb`). Checked first against `init()` in `store.ts` (subscribe after hydrate), `writeBehindQueue.ts` (an upsert's `'u'` published after commit) and `pgNotify.ts` (`publish` only logs; recovery only on `error`). The three YAML files parse to the same documents as before. No test: only documents and comments changed |
| 2   | Medium. U4b took the latest ordinal minus one as the schema without `invitation_admissions`; any new migration, v46's 106 among them, turns it red in `test:integration` and `pnpm test`, and decision 4 did not list it                                                                                                                                                                                                                | Fixed (`7bc2db101b`): the ordinal comes from the migration whose SQL creates the table, the table's absence is checked before the method is, and the one-behind and 99 cases stay. Reproduced first: U4b failed with a no-op 106 and with v46's 106 (Mutation checks). Overlap (e) in decision 4                                                                                                                                                                                                                                                                                          |

No finding was rejected.

## Changed after review round 3

The third review ran at `232b8c6409` and found eight low findings; the
eighth repeats the third's two `erase*` comments. Before they were worked,
`develop` at `f6da7b7d16` was merged in (`a0f6012736`, no conflict; it
changed no file under `packages/api/src` or `packages/api/test`). Each
finding was checked here first; all were real.

| #    | Finding                                                                                                                                                                                                                                                       | Now                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `src/index.ts`'s production refusal, `pgNotify.ts`'s header and `store.ts`'s header called the store eventually consistent without the case `KNOWN_LIMITATIONS.md` now states: a process that misses a notification stays stale until it restarts or re-reads | Corrected (`a8edded8ab`) in `KNOWN_LIMITATIONS.md`'s words, and none of the three says "eventually" now. The "Documents corrected" line that said `pgNotify.ts`'s header described what exists was wrong (that header had not been changed) and is corrected. Checked first: the three texts as quoted; no test matches the refusal's text                                                                                                                                                                                                                                                                                        |
| 2    | `store.ts`'s header ("a row a call did not change is never rewritten"), `KNOWN_LIMITATIONS.md` and both deploy comments ("a write names only the rows it changed") are false for an upsert whose method returns a record unchanged                            | Corrected (`a8edded8ab`): no write reconciles a table; a targeted op writes only the rows its call changed; an upsert writes the one row the call returned, whole, even when unchanged. Checked first in `installWriteThrough` (it queues an upsert whenever the result is an object) and `markUserEmailVerified` (a verified account's record returned as it is, so the users row is rewritten, `password_hash` included). The 11 methods of that shape a scan found are named in O3 as PR 2 candidates. Found while fixing it: O3 said "about 160" upsert specs; `MUTATOR_SPECS` has 220 (and 42 targeted), counted at run time |
| 3, 8 | `eraseDeadmanSwitch` called its write "a targeted upsert"; `eraseScheduledMessage` and `eraseReleaseIdentity` said a single-row upsert "cannot touch a row another replica wrote"                                                                             | Corrected (`a8edded8ab`): "an upsert", and "cannot touch any other row; it can still overwrite a newer version of this one (last writer wins)". Checked first: the three specs are `upsert(...)` in `pgDescriptors.ts`                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4    | Four spec predicates had no test that failed without them: #41's `consumed_at IS NULL`, #40's `sent_at IS NULL`, #12's `AND expires_at > $2`, #32's `nullMatchesAny`                                                                                          | Tests (`b2ba8803c7`) in X13, X5 and X11, and #14's expiry test, which had none either. Reproduced first: with each of the five removed, `store-cross-process` and `store-spec-coverage` passed 43 of 43. Now each fails exactly one test (round-3 mutation table)                                                                                                                                                                                                                                                                                                                                                                 |
| 5    | The first mutation table said "with the final commit's changes", but its counts were from before round 1 (the review dates them to `a1696d1609`; the saved runs, finished between 05:51 and 06:21 UTC, predate even `c30077a925`, committed at 06:46)         | Re-run at `a8edded8ab`, this branch's code after round 3, with the round-3 tests, and the rows replaced (Mutation checks). The two rows that put `develop`'s code under today's tests do not finish (a test never settles and the rest are cancelled), so each keeps its earlier result, labelled as run before round 1                                                                                                                                                                                                                                                                                                           |
| 6    | Decision 4 named v46 as `215eff7c6d`; that branch moves                                                                                                                                                                                                       | Now "`215eff7c6d` or later; re-run `git merge-tree` before merging". During round 3 it moved to `dbc50a2ae5` and then `9fffb126a5`, where `store.ts` has 4 conflict hunks, not 3 (decision 4)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7    | Decision 2 said the three round-1 receiver fixes are safe in either release and that putting them in A means cherry-picking; one does not apply to A as it stands                                                                                             | Corrected after applying each to `0ca48db41b` in a scratch worktree: `0cd7b9ab75`'s capture half changes code B adds, and its reload half is a no-op in A; the other two apply, and A's store tests pass with them (decision 2)                                                                                                                                                                                                                                                                                                                                                                                                   |

No finding was rejected.

## Changed after review round 4

A fourth review, of `f023389188`, found no medium or high issue and two low
ones. Both are fixed in the commit after `f023389188`; its gates are in that
commit's message.

| #   | Finding                                                                                                                                                                                                                                                                       | Done                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | #30 (`deleteCoalitionSpatialItem`) has the same `nullMatchesAny` as #32, and no test failed when it was removed; the #30 row and D5 did not say that a pin copy with no `updatedAt` is deleted whatever Postgres holds                                                        | X12 now removes `updatedAt` from a pin's mirror copy and requires the pin gone from Postgres and the mirror, as X11 does for a reply. Removed alone in a scratch worktree at `f023389188`'s code: baseline X12 passes; without `nullMatchesAny` X12 alone fails ("a pin whose copy has no updatedAt is deleted", 1 where 0 was expected). The #30 row and the X12 row say so; the round-3 mutation table has the row |
| 2   | `deploy/helm/blackout/values.yaml:24` and `deploy/kubernetes/phase4/blackout-api.yaml:54` still opened with "Consistency is EVENTUAL", the wording round 3 removed from `store.ts`, `pgNotify.ts` and `index.ts` because a process that misses a notification never converges | Both now read "Reads are stale for a time"; the sentences after it, which already give the missed-notification case, are unchanged. Both files still parse to the same documents (`yaml.parseAllDocuments`, 0 errors)                                                                                                                                                                                                |

## Changed in the publication review

A review of the text for publication (2026-11-08) found nine sentences that
were not exact. Four were in this record; the others were in the pull request
text and the advisory text, which are not in the tree. Each was checked here
first; all were real. Finding numbers are the review's.

| #   | Finding                                                                                                                                                                                                                                                           | Now                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | "Disclosure", decision 1 and S1 called the hourly prune "the one trigger that needs no request". The retention sweep (at boot and daily, on by default) and, with the FBM bridge on, the flash-mob pin sweeper also resynced a table with no request (#32, #30)   | "The one request-less trigger on the security tables". S1 lists the two sweeps with their tables and switches; decision 1 says they still run                                                                                                                         |
| 4   | "Disclosure" said the sign-up rollback trigger "stayed live" from 2026-11-02. In the operator's deployment the proxy has answered `503` to `POST /v1/auth/register` since that day, and a deploy that syncs the stack directory replaces the server's `Caddyfile` | "Disclosure" says the route has been blocked at the proxy since then, as a separate measure, and that the other routes S1 lists stayed reachable. "After upgrading" step 3 says such a sync lifts the block, and step 5 that it comes off with the fix for that route |
| 5   | The header said every `develop` commit before the merge has the defect. The resync exists only from `eb71cc56c3` (the merge of #878, 2026-08-10), which added `pgWriter.ts` with `resyncMap`                                                                      | The header gives that range                                                                                                                                                                                                                                           |
| 7   | Decision 3 offered the JWT rotation as one of two choices while "After upgrading" step 2 instructed it, and no decision on it was recorded                                                                                                                        | Step 2 is the recommended option and says what skipping it means; decision 3 says no decision is recorded                                                                                                                                                             |

Two more changes came with them. The operator confirmed on 2026-11-08 how
production runs as one process ("Disclosure"), so decision 1 no longer says
the worker "is still a second process": it gives the dated facts, and "After
upgrading" step 4 ends both measures. And while finding 4 was checked, S1's
unauthenticated triggers were found short: they listed only `/register`, but
confirming a password reset or an email verification, or completing an OIDC
sign-in, needs no sign-in and consumed a row through a resync on `develop`
(#2, #3, #14; `resync('passwordResetTokens')`, `resync('emailVerificationTokens')`
and `resync('pendingOidcLogins')` in `pgDescriptors.ts` at `ff7d08bfa0`). S1
now lists them.

## Commits

On `claude/bmc-transmutation-strategy-6jenal-v49`, after `ff7d08bfa0`:

| Commit       | What                                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `75b6060037` | Targeted statement primitives in `pgWriter` (U2, U3)                                                                                                                                                                                                   |
| `2f5b92a5a1` | Receivers re-read changed keys by key, behind a per-key fence (X14, X16, X16b)                                                                                                                                                                         |
| `0ca48db41b` | Computing an upsert's fence key never throws into the mutator                                                                                                                                                                                          |
| `60203eb3a4` | The targeted kind, one transaction per call, the keyed deletes (#11, #16–29, #31, #33, #36, #38)                                                                                                                                                       |
| `cbce376602` | The auth tables: #1–9, #12–15, #39–42 (X1–X5, X7, X13, X17, X19, U7)                                                                                                                                                                                   |
| `111eabe39e` | Bounty, sweepers, mesh and coliseum: #10, #30, #32, #34, #35, #37 (X8, X8b, X9–X12, X11b)                                                                                                                                                              |
| `c30077a925` | Remove the resync; U1, U6, X1b, X7b, X8c; the prose, `KNOWN_LIMITATIONS.md`, the M11 note, this record                                                                                                                                                 |
| `a1696d1609` | The file store's temp file is per process (O13); this record's gates                                                                                                                                                                                   |
| `b0b5bfbd32` | Round 1: a refresh re-reads a key whose queued write landed while its `SELECT` was out (X16d)                                                                                                                                                          |
| `7b94aa8344` | Round 1: `flushRuntimeStoreWrites` waits for the write queue only (`drainWrites`)                                                                                                                                                                      |
| `2efb0ffeab` | Round 1: the store boots on a schema behind the code (U4b)                                                                                                                                                                                             |
| `0e712a9b7e` | Round 1: a gate miss after a lost `COMMIT` reply is not counted (X8d)                                                                                                                                                                                  |
| `551a39043b` | Round 1: the mesh writer re-reads merged `seen_by`, kept in first-seen order (X9)                                                                                                                                                                      |
| `b28fc592ad` | Round 1: one dropped LISTEN connection is replaced once, and released (S9)                                                                                                                                                                             |
| `0cd7b9ab75` | Round 1: the capture and the reload keep a mirror map's own kind                                                                                                                                                                                       |
| `f80b923e4d` | Round 1: a file store's boot removes temp snapshots dead processes left (O16)                                                                                                                                                                          |
| `b828f7f244` | Round 1: Helm chart, headers, production error and alert text say write-behind                                                                                                                                                                         |
| `baa7a1d593` | Round 1: this record, `KNOWN_LIMITATIONS.md`                                                                                                                                                                                                           |
| `7bc2db101b` | Round 2: U4b finds the schema without `invitation_admissions` by its migration (overlap (e))                                                                                                                                                           |
| `beeaa6556c` | Round 2: a missed notification lasts until restart: `KNOWN_LIMITATIONS.md`, deploy comments, M11 note                                                                                                                                                  |
| `265f430fdb` | Round 2: the single-server compose file says write-behind, and that a missed notification lasts                                                                                                                                                        |
| `232b8c6409` | Round 2: this record                                                                                                                                                                                                                                   |
| `a0f6012736` | Merge `develop` at `f6da7b7d16` (#993, #994, #995); no file under `packages/api/src` or `test` changed there                                                                                                                                           |
| `b2ba8803c7` | Round 3: X5, X11 and X13 fail without #12, #14, #32, #40 and #41's predicates                                                                                                                                                                          |
| `a8edded8ab` | Round 3: the store's comments say a missed notification lasts, and that an upsert rewrites its row                                                                                                                                                     |
| `f023389188` | Round 3: this record                                                                                                                                                                                                                                   |
| `3f4a6752f2` | Round 4: X12's null-stamp case; the deploy comments no longer say "eventual"                                                                                                                                                                           |
| `51a37fa8b9` | Merge `develop` at `7bda9eb72a` (#996, #997 and the documentation commits after them); no file under `packages/api` changed there                                                                                                                      |
| `e30c6d5c4f` | For publication: "Disclosure", "After upgrading", the header, decisions 1, 3 and 4, O3, and the gates on the merged head                                                                                                                               |
| `f2054bd111` | Merge `develop` at `27d8c17051` (#998, with lodash 4.18.1); no file under `packages/api` changed there                                                                                                                                                 |
| this commit  | The publication review: the header's range, the request-less and unauthenticated triggers, the sign-up block, the rotation as the recommended step, the single process's dated facts, "After upgrading" steps 3 to 5, and the gates on the merged head |

Release A of the rollout (decision 2) is the receivers: the first three
commits. Release B is the rest. Which round-1 receiver fixes can also go
into A, and which cannot, is in decision 2.

## Documents corrected

-   `packages/api/src/db/store.ts`: the store's header said "durability is
    unaffected (the write is already committed to Postgres)". The store is
    write-behind: a mutator returns before its write runs, so a crash or a write
    that fails twice loses it. The header now says so, and says what is written.
    Two account-deletion comments explained keeping a row by the resync's danger;
    they now say the write is a single-row upsert.
-   `packages/api/src/db/pgDescriptors.ts`: the header and the spec kinds;
    `pgNotify.ts`: the `'r'` op. Each describes what exists now.
    `pgNotify.ts`'s own header was not changed, and called reads "eventually
    consistent" until review round 3 (below).
-   `packages/api/src/db/writeBehindQueue.ts`: a lost write is lost "before a
    later resync"; there is none.
-   `packages/api/src/services/authRowsPruneScheduler.ts` and
    `coalitionExternalRetention.ts`: each prune is a resync, a delete is a
    whole-table reconcile. Both now say what is written.
-   `packages/api/src/scripts/cleanCoalitionDemoSeed.ts`: a running server's
    "Postgres resync" would write the seed rows back.
-   `deploy/kubernetes/phase4/blackout-api.yaml`: "Multi-replica safe" and
    "writes commit to Postgres synchronously". Neither was true. The comment now
    describes the write-behind queue and the window.
-   `KNOWN_LIMITATIONS.md`: "Several API processes on one database"; and the M11
    note in `docs/audits/pre-launch-readiness-audit-2026-07.md`, which had
    marked M11 fixed on documents alone.

After review round 1:

-   `deploy/helm/blackout/values.yaml`: the store is "write-through" and "Safe
    at >1 replica because pgNotify keeps each replica's in-memory mirror
    coherent", the claim removed from the Kubernetes manifest; the chart runs
    three replicas with an HPA. It now says what the manifest says. It also
    offered `file` as a fallback, which the API refuses under the chart's
    default `NODE_ENV` (production).
-   `packages/api/src/index.ts`: the production refusal of a non-Postgres store
    called Postgres mode "a durable, multi-replica-safe store".
-   `packages/api/src/db/pgWriter.ts` and `pgDescriptors.ts`: the first lines
    and the `MUTATOR_SPECS` comment said "write-through".
-   `packages/api/src/db/pgDescriptors.ts`: `USER_CASCADE_CHILDREN` said every
    mirror is told of the account's child rows (O15).
-   `deploy/docker/production/monitoring/prometheus/coalition-alert-rules.yml`:
    a latency alert pointed at the "DB write-through queue".
-   `KNOWN_LIMITATIONS.md`: the whole-row bullet named only other tables, and
    the deletion bullet now says what O15 does to a user.
-   This record: S2, O10, O13 and the fence sentence, as listed above.

After review round 2:

-   `KNOWN_LIMITATIONS.md`: a stale copy was "that window"; for a process that
    misses a notification it lasts until a restart or a re-read. A new bullet
    says which processes miss one, and that a sign-out missed there is
    accepted until the token expires. The whole-row bullet no longer says "in
    the same window".
-   `deploy/kubernetes/phase4/blackout-api.yaml` and
    `deploy/helm/blackout/values.yaml`: "a replica can serve the old value
    until the notification arrives" now goes on to the replicas that never
    hear of a change. The manifest no longer offers "re-read after a short
    delay" as read-your-write.
-   `docs/audits/pre-launch-readiness-audit-2026-07.md`: the M11 note names
    the read-side gaps left open (O4).
-   `infra/single-server-baseline/docker-compose.yml`, found while fixing the
    above: the store "write-throughs every mutation", and several replicas are
    left with "only a bounded stale-read window equal to NOTIFY latency".
    Neither was true. The baseline runs one API container and no worker.
-   This record: O4 and the U4b row.

After review round 3:

-   `packages/api/src/db/store.ts` (the store's header), `pgNotify.ts` (its
    header) and `src/index.ts` (the production refusal of a non-Postgres
    store) called the store eventually consistent without the case
    `KNOWN_LIMITATIONS.md` states: a process that misses a notification (the
    boot gap, a failed after-commit send, a half-open listener) keeps its old
    copy until it restarts or re-reads the row. Each now says so in
    `KNOWN_LIMITATIONS.md`'s words, and none says "eventually".
-   `store.ts`'s header said "a row a call did not change is never
    rewritten"; `KNOWN_LIMITATIONS.md` and both deploy comments said "a write
    names only the rows it changed". An upsert writes the row its call
    returned even when the call changed nothing (O3). Each now says that no
    write reconciles a table, that a targeted op writes only the rows its call
    changed, and that an upsert writes the one row the call returned, whole,
    even when unchanged. The two YAML files parse to the same documents as
    before.
-   `store.ts`: `eraseDeadmanSwitch` called its write "a targeted upsert"; it
    is an upsert (`upsert('deadmanSwitches')`). `eraseScheduledMessage` and
    `eraseReleaseIdentity` said the single-row upsert "cannot touch a row
    another replica wrote"; it cannot touch any other row, and can still
    overwrite a newer version of this one (last writer wins).
-   This record: the "Documents corrected" line above on `pgNotify.ts`, O3's
    count (220 upsert specs, counted from `MUTATOR_SPECS` at run time; it
    said about 160) and its PR 2 candidates, O4, decisions 2 and 4, the X5,
    X11 and X13 rows, the first mutation table, and the header, gates and
    commits for the merge and round 3.

Records written before this one (`api-findings-triage-2026-10-25.md`, D2: the
prune "as a resync of `revokedSessions`") are left as written; this record
supersedes them on the point.
