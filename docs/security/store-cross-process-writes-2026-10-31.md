# Store writes across processes — the whole-table resync, 2026-10-31

The API's Postgres store wrote 38 of its mutators through as a **whole-table
resync**: the writing process read every key in the table, deleted each row its
own in-memory mirror did not hold, and rewrote every row from its own copy. Any
row another process had written and this one had not yet heard of was deleted;
every row it held a stale copy of was reverted; a row another process had
deleted came back. Peers then reloaded the table, so the loss reached every
mirror. This record covers that defect and its fix (PR 1 of the plan), what was
run to show both, what it leaves open, and what the operator has to decide.

**Rating:** High. It is fixed on this branch, not on `develop`.
**State read:** `develop` at `ff7d08bfa0`. The fix is the seven commits after it
on the branch (listed under "Commits").
**Read** means a claim rests on the code; **Run** that it was observed in Node
22.22.0 in this worktree, on PGlite or on PostgreSQL 16.15 as stated; **Test**
names the regression test that keeps it true. No production deployment was
examined.

| ID  | Finding                                                                                                                                     | Verified                  | Disposition                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| S1  | A whole-table resync deletes rows other processes wrote and rewrites the rest from one process's mirror                                     | Run (develop), test       | Fixed: 38 resync specs and 4 unspecced methods became targeted statements |
| S2  | Four email-verification and reset-token mutators had no spec, so they never reached Postgres                                                | Read, test (X13)          | Fixed with S1                                                             |
| S3  | `purgeUserAuthArtifacts` listed `revokedSessions`, which it never writes, and omitted `linkedAccounts`, which it does                       | Read, test (X7, U1)       | Fixed with S1                                                             |
| S4  | The resync keyed composite rows with a `:` join, which never matched a `circleEdges` key (`a::b`)                                           | Read, test (U2, X6)       | Fixed with S1                                                             |
| S5  | A change notification was sent after the write, on another connection, so it could be lost, or announce a rolled-back write                 | Read, test (X15, X18)     | Fixed for targeted writes; upserts still notify after commit (open, O4)   |
| S6  | A peer's `'u'` refresh only ever set a row, so a deleted row stayed in the peer's mirror until a table reload                               | Read, test (X14)          | Fixed: `'u'` and `'k'` remove a key whose row is gone                     |
| S7  | Four other methods write a mirror map and have no spec: closing a governance vote, a mirrored aid post, campaign attribution and engagement | Read, test (U1 allowlist) | Open: not persisted in Postgres mode; for the operator (O8)               |
| S8  | Account deletion's denylist write for the current token cannot persist (`revoked_sessions.user_id` cascades from `users`)                   | Read                      | Open, pre-existing (O6, decision 6)                                       |

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
-   Any signed-in account: logout and refresh (`services/refreshToken.ts`),
    revoke-all and password change (`routes/auth.ts`), account deletion
    (`services/accountLifecycle.ts`), unlinking an account, and deleting a vault
    item, a webhook or a bridge.
-   The worker, with no request at all: the auth-rows prune
    (`services/authRowsPruneScheduler.ts`) runs at boot and then hourly,
    resyncing `revoked_sessions`, `pending_oauth_links` and `pending_oidc_logins`.
    It is on unless `BLACKOUT_AUTH_ROWS_PRUNE=0` (`packages/api/src/backgroundLoops.ts`).

It needs more than one process on one database. Postgres mode is the default
whenever `DB_HOST` is set; production Docker runs `app` and `worker` on one
database, and the Kubernetes manifest runs three API replicas.

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
    not fit (an unknown column inside a literal, a missing guard column) makes
    `init` reject, and `runtimeStoreBoot` does not catch it, so the process does
    not start (U4).
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
    are announced and re-read with the retry's.
-   **Self-refresh.** After the op, every key where Postgres's effect and the
    mirror's differ (the symmetric difference of returned and changed keys) is
    re-read into the mirror.
-   **Receivers re-read by key.** A peer re-reads every key a `'k'` or `'u'`
    names: a row found is put into its mirror, a key with no row is removed.
    `'r'` is no longer sent; it is still received, as a table reload, for one
    release, for processes still on the old code.
-   **A per-key fence.** While this process has a queued write for a key, a
    refresh skips that key and re-reads it once the write lands, so a peer's
    change cannot take back a local write that has not reached Postgres yet.
-   **Nothing after the original call throws into the caller.** A failure to
    capture, bind or queue is logged and counted as a lost write
    (`db_write_behind_failures_total`), as a write that fails twice always was.

### Per mutator

"Unseen" means the statement also reaches rows the calling process has not
heard of. Tests are in `packages/api/test/store-cross-process.integration.test.ts`
unless marked; U3 (`pg-writer-targeted`) compiles and `PREPARE`s every step of
every spec, and U6 (`store-spec-coverage`) checks every targeted mutator's
captured keys, so neither is repeated per row.

| #     | Mutator                                                                                     | Now                                                                                                                                                                                                                            | Unseen   | Test                                |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------- |
| 1     | `deleteUser`                                                                                | One transaction: `DELETE … WHERE <fk> = $1` for each of the 20 `USER_CASCADE_CHILDREN`, then `DELETE FROM users WHERE id = $1`. `revoked_sessions` is left to the cascade (D1 below)                                           | children | X2, X17, U7                         |
| 2–4   | `consumePasswordResetToken`, `consumeEmailVerificationToken`, `consumeAccountDeletionToken` | `UPDATE … SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL`, values from the call's record; nothing when the call changed nothing                                                                                    | —        | X5                                  |
| 5     | `deleteInvitationAdmissionsForUser`                                                         | `DELETE … WHERE claimed_by_user_id = $1 OR ($2::text IS NOT NULL AND matrix_user_id = $2::text)`                                                                                                                               | yes      | X7b                                 |
| 6     | `purgeUserAuthArtifacts`                                                                    | One transaction, six `DELETE … WHERE <user column> = $1`: the three token tables, `refresh_tokens`, `linked_accounts`, `pending_oauth_links` (S3)                                                                              | yes      | X7, U1                              |
| 7     | `revokeRefreshTokenFamily`                                                                  | `UPDATE refresh_tokens SET revoked_at = $2, revoked_reason = $3 WHERE family_id = $1 AND revoked_at IS NULL`; `$2` is the time the mutator stamped on the mirror (D3)                                                          | yes      | X3                                  |
| 8     | `revokeRefreshTokensForUser`                                                                | The same, `WHERE user_id = $1 AND revoked_at IS NULL`                                                                                                                                                                          | yes      | X4                                  |
| 9     | `pruneExpiredRevokedSessions`                                                               | `DELETE FROM revoked_sessions WHERE expires_at <= $1`, `$1` the call's `now`                                                                                                                                                   | yes      | X1, X19                             |
| 10    | `acceptBountyApplication`                                                                   | One transaction: (required) claim the bounty `WHERE id = $1 AND status = 'open'`; (required) accept the application `WHERE id = $1 AND status = 'pending'`; decline `WHERE bounty_id = $1 AND id <> $2 AND status = 'pending'` | siblings | X8, X8b, X8c                        |
| 11    | `deleteLinkedAccount`                                                                       | `deleteKey (blackout_user_id, provider)`                                                                                                                                                                                       | —        | `pg-notify-replication`             |
| 12    | `consumePendingOAuthLink`                                                                   | As 2, `WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > $2`                                                                                                                                                      | —        | X5                                  |
| 13    | `prunePendingOAuthLinks`                                                                    | `DELETE … WHERE expires_at <= $1`                                                                                                                                                                                              | yes      | X1b                                 |
| 14    | `consumePendingOidcLogin`                                                                   | As 12, on `pending_oidc_logins`                                                                                                                                                                                                | —        | X5                                  |
| 15    | `prunePendingOidcLogins`                                                                    | As 13                                                                                                                                                                                                                          | yes      | X1b                                 |
| 16–29 | the 14 bridge, webhook, token, panel, listing, vault and reward deletes                     | `deleteKey` by the descriptor's key (`deleteTwitchEventSubscription` by its Helix id)                                                                                                                                          | —        | X15, X16c, X18 on `deleteVaultItem` |
| 30    | `deleteCoalitionSpatialItem`                                                                | `deleteKey` guarded on `updated_at` as the mirror held it, at millisecond precision                                                                                                                                            | —        | X12                                 |
| 31    | `deleteCoalitionExternalActivity`                                                           | `deleteKey`                                                                                                                                                                                                                    | —        | U3, U6                              |
| 32    | `deleteCoalitionExternalActivities`                                                         | One `DELETE … USING unnest(ids, versions)` of the replies the call removed, each guarded on its `updated_at` (D5)                                                                                                              | —        | X11, X11b                           |
| 33    | `removeCircleEdge`                                                                          | `deleteKey (follower_id, followee_id)` (S4)                                                                                                                                                                                    | —        | X6                                  |
| 34–35 | `enqueueMeshEnvelope`, `replaceMeshEnvelopes`                                               | Upsert each envelope the call added or changed, `seen_by` merged with Postgres's; delete by id each envelope the call dropped (D6)                                                                                             | —        | X9                                  |
| 36    | `deleteClip`                                                                                | `deleteKey`                                                                                                                                                                                                                    | —        | U3, U6                              |
| 37    | `upsertColiseumArguments`                                                                   | Upsert each argument the call changed, whole                                                                                                                                                                                   | —        | X10                                 |
| 38    | `deletePluginInstallation`                                                                  | `deleteKey`                                                                                                                                                                                                                    | —        | U3, U6                              |
| 39    | `deleteExpiredPasswordResetTokens` (no spec before)                                         | `DELETE … WHERE expires_at < $1`                                                                                                                                                                                               | yes      | X13b                                |
| 40    | `markEmailVerificationTokenSent` (no spec before)                                           | `UPDATE … SET sent_at = $2 WHERE id = $1 AND sent_at IS NULL`                                                                                                                                                                  | —        | X13                                 |
| 41    | `revokeEmailVerificationTokensForUser` (no spec before)                                     | `UPDATE … SET revoked_reason = $2 WHERE user_id = $1 AND consumed_at IS NULL AND revoked_reason IS NULL`                                                                                                                       | yes      | X13                                 |
| 42    | `deleteExpiredEmailVerificationTokens` (no spec before)                                     | `DELETE … WHERE expires_at < $1 AND consumed_at IS NULL`                                                                                                                                                                       | yes      | X13b                                |
| —     | allowlist (U1)                                                                              | No spec, on purpose: the three in-memory diagnostics (`touchTwitchIrcBotTokenUsed`, `touchObsWsPasswordUsed`, `touchWidgetAlertTokenDelivered`) and 16 test seams; plus the four known gaps of S7                              | —        | U1                                  |

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
    commit message wrongly calls that the design's.
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

| Test          | What it shows                                                                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1            | The original `resync-revoked` probe: the worker's prune keeps a live revocation and a later logout-everywhere cutoff it had not heard of, and prunes the expired row; the app and a process booted afterwards still refuse the token and keep the later cutoff |
| X1b           | The OAuth and OIDC state prunes keep an unexpired row the pruning process had not heard of, and remove an expired one                                                                                                                                          |
| X2            | The original `resync-users` probe: deleting one account keeps an account the deleting process had not heard of, in Postgres and in the peer's mirror                                                                                                           |
| X3            | A family revoke reaches the successor a peer minted; the parent keeps `replaced_by` and `rotated`; both mirrors hold Postgres's rows                                                                                                                           |
| X4            | Revoke-all reaches a token a peer minted, and a token the revoking process held carries in Postgres the time its mirror stamped                                                                                                                                |
| X5            | For all five consumes, Postgres keeps the first `consumed_at` and the stale process re-reads it                                                                                                                                                                |
| X6            | Removing a circle edge is one `DELETE` by key; an unseen edge is kept (first half)                                                                                                                                                                             |
| X7            | Purge removes the account's rows written elsewhere in all six tables, linked accounts included, and leaves revocations and another account's rows                                                                                                              |
| X7b           | Deleting an account's invitation admissions reaches ones written elsewhere and keeps another account's                                                                                                                                                         |
| X8            | Accepting one applicant declines a sibling the accepting process had not heard of                                                                                                                                                                              |
| X8b           | A second process that had not heard of the first accept accepts another applicant; its gate rolls back, the conflict is counted, both mirrors converge                                                                                                         |
| X8c           | A stale accept of a bounty another process claimed directly accepts and declines nothing                                                                                                                                                                       |
| X9            | A gossip merge and an enqueue keep an envelope they had not heard of; the merge writes the arrival, deletes what it dropped and merges `seen_by`                                                                                                               |
| X10           | A score recompute keeps an argument it had not heard of                                                                                                                                                                                                        |
| X11, X11b     | The retention sweep deletes a reply it judged unchanged, keeps one another process changed since, and deletes one whose `updated_at` has microseconds                                                                                                          |
| X12           | The pin sweeper deletes an unchanged pin, one with microseconds and one stamped by `DEFAULT NOW()`, and keeps a pin another process rewrote                                                                                                                    |
| X13, X13b     | A superseded verification token (also one a peer issued) and its sent time survive a restart; the expired-token deletes judge Postgres's rows                                                                                                                  |
| X14–X16c, X18 | First half: receivers drop gone keys, the fence, in-transaction notification and rollback, a required miss, retry after a lost `COMMIT`                                                                                                                        |
| X17           | After an account is deleted, neither mirror holds its vault items (including one the deleter had not heard of), link or webhooks; the peer still refuses its token (D1)                                                                                        |
| X19           | A 2,000-row prune announces every key once, in payloads under 8,000 bytes, and the peer converges                                                                                                                                                              |
| U7            | `USER_CASCADE_CHILDREN` with `USER_CASCADE_LEFT_IN_MIRRORS` equals the 21 cascading foreign keys to `users`, and `deleteUser` deletes each child first                                                                                                         |

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
now asserts that a delete goes out as `'k'` and that nothing sends `'r'`.

## Mutation checks

Each was run in a scratch `git worktree add --detach` copy of this branch
(with the final commit's changes), one at a time, and the copy was removed
afterwards. "Fails" lists the tests that failed; every other test in the files
run passed. Files: X = `store-cross-process`, C = `store-spec-coverage`,
W = `pg-writer-targeted`. PGlite unless marked.

| Mutation                                                                                                  | Files | Result                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| None (baseline)                                                                                           | X C W | 44 of 44 pass; on PostgreSQL 16.15, X 36 of 36                                                                                                                   |
| `develop`'s `src/db` entire                                                                               | X C   | all 38 fail. Many at setup (`develop` ignores `'k'` and lacks the new seams), so the next row is the comparison that matters. U1 lists exactly S2 and S3         |
| `develop`'s `pgDescriptors.ts` on this branch's writer and receivers (before the resync code was removed) | X     | 25 of 36 fail: every new X test except X11b (a guard-precision test with no guard to test), plus X6, X15, both X18, X16c and U7. The same 25 on PostgreSQL 16.15 |
| No self-refresh                                                                                           | X     | X3, X4, X5, X8, X8b, X8c, X11, X12, X17, X15b, self-refresh                                                                                                      |
| No `'k'` publish                                                                                          | X     | 22 fail: X1, X1b, X2, X3, X4, X6, X7, X7b, X8, X9, X10, X11, X12, X13, X13b, X15, X16c, X17, X18 (both), X19, self-refresh                                       |
| No guard on #30 and #32                                                                                   | X     | X11, X12                                                                                                                                                         |
| Plain equality instead of `date_trunc('milliseconds', …)`                                                 | X     | X11b, X12; the same on PostgreSQL 16.15, where `DEFAULT NOW()` has microseconds                                                                                  |
| No `required` on #10                                                                                      | X     | X8b (its conflict count), X8c (its rows); the same on PostgreSQL 16.15                                                                                           |
| Mirror keys built by a `:` join                                                                           | X W   | U2, the composite-key test, X14 (both), X6                                                                                                                       |
| `'u'`/`'k'` keep a key whose row is gone                                                                  | X     | 16 fail, among them X14 (both), X1, X2, X7, X17, X19                                                                                                             |
| No fence                                                                                                  | X     | X16, X16b, X16c                                                                                                                                                  |
| Notification after commit, with the in-transaction `NOTIFY` failing                                       | X     | X15                                                                                                                                                              |
| Purge's map list as on `develop` (`revokedSessions` for `linkedAccounts`)                                 | X C   | X7, U1, U6                                                                                                                                                       |
| Specs #39 to #42 dropped                                                                                  | X C   | X13, X13b, U1, U6                                                                                                                                                |
| The revocation prune ignores expiry                                                                       | X     | X1, X19                                                                                                                                                          |
| Account deletion without the explicit child deletes                                                       | X     | X17, U7                                                                                                                                                          |
| Revocations among the explicit child deletes (D1 reversed)                                                | X     | X17                                                                                                                                                              |
| A consume without `consumed_at IS NULL`                                                                   | X     | X5                                                                                                                                                               |
| A revoke binding a time other than the mirror's                                                           | X     | X4                                                                                                                                                               |
| The capture does not record `delete`                                                                      | C     | U6                                                                                                                                                               |
| A method assigns into a mirror record in place                                                            | C     | U1                                                                                                                                                               |
| A new method that writes `users` with no spec                                                             | C     | U1                                                                                                                                                               |

The first half's mutations (no transaction, no retry, unkept uncertain keys,
no boot `PREPARE`, an unknown method skipped, no chunking, an unchanged call
queued, a wrapper that throws, and the receiver mutations) are in its commit
messages; four of them were re-run here on the final code (`:` join, absent
rows kept, no fence, notification after commit) with the results above.

## Gates

Run in `packages/api` on this commit's code, before this record was added
to it (Node 22.22.0, pnpm 9.15.4):

| Gate                                                   | Result                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`, `pnpm typecheck`                          | clean                                                                                                                          |
| `pnpm test:integration` (CI's PR gate)                 | 2014 of 2015, three runs; each time the one failure was a `streaming-module` test hit by the file store's temp-file race (O13) |
| `pnpm test` (post-merge, `--test-force-exit`)          | TAP: tests 2135, pass 2135, fail 0, cancelled 0; all 23 tests the last three commits add appear in it (2112 before them)       |
| `pnpm test:launch-smoke`                               | 14 of 14                                                                                                                       |
| `store-cross-process` on PostgreSQL 16.15 (loopback)   | 36 of 36, three runs; every per-test and template database dropped afterwards                                                  |
| the store's test files on PGlite (mutation baseline)   | `store-cross-process`, `store-spec-coverage` and `pg-writer-targeted`: 44 of 44                                                |
| root `pnpm exec prettier --check` on the changed files | clean                                                                                                                          |

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
-   **O3 — the upsert siblings.** About 160 specs are still whole-row upserts, and
    the last writer wins. On the security tables that means a stale
    `markUserEmailVerified` can revert a password change, a stale
    `updateUserPassword` can re-insert a deleted account, a stale moderation
    call can overwrite a rejection, and a stale vault update can bring back old
    ciphertext, each inside the window. PR 2 (sticky revocation and consumption
    columns, patch and insert-only kinds) closes those; it needs the operator's
    approval and is not built. Others to review after it: voice-room sanctions,
    moderation actions, marketplace entitlements, creator stream auth, canary
    tokens, dead-man switches, scheduled messages and release identities.
-   **O4 — the rest of M11's stale-read gaps.** An upsert's notification is still
    sent after commit, fire-and-forget, on another connection; the gap between
    hydrating and `LISTEN` at boot is still open; a half-open listener is not
    noticed, since only an `error` event triggers recovery; and writes made
    before `init` are dropped.
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
    API mints is a uuid (`crypto.randomUUID()` in the three places it creates
    users), so no current caller does this; a non-uuid id would now fail loudly
    where the resync silently ignored it.
-   **O11 — no test isolates the apply chain's order.** The receiver also re-reads
    a key whose mirror value changed while its `SELECT` was in flight, which makes
    out-of-order refreshes converge without the FIFO chain (commit 2).
-   **O12 — evidence.** The store code ran on PGlite and on a throwaway
    PostgreSQL 16.15 on loopback. No production deployment was examined, nothing
    ran under a transaction-mode pooler, and CI has no real-Postgres job for these
    tests.
-   **O13 — a test flake outside this change.** The file store writes every
    snapshot through one fixed temporary name (`store.json.tmp`), so two test
    files that use the default file store and run in parallel can race on it:
    one gets `ENOENT` on the rename and answers 500. It failed one
    `streaming-module` test in two of the `test:integration` runs (Gates). It is
    in the file store, not the Postgres store, and is left for its own fix.

## For the operator

Nothing here was decided by this work, and no flag or environment switch was
set in any committed file.

1. **Interim mitigation, before this ships.** Setting `BLACKOUT_AUTH_ROWS_PRUNE=0`
   on the worker removes the one trigger that needs no request: the hourly prune
   that resyncs `revoked_sessions` (`packages/api/src/backgroundLoops.ts`; the
   prune was added in `053778f728` on 2026-10-26). Expiry is checked on read, so
   the only cost is that the three tables grow; the code says the prune
   "discharges an obligation, not a feature".
   **It was not set.** Whether to set it is the operator's call. Scaling the API
   to one replica narrows the rest, but the worker is still a second process.
2. **Rollout.** A process on the old code ignores `'k'`. Either ship two
   releases (A: commits 1 to 3 of this branch's first half, the receivers, to
   every process; B: the rest), or ship one with a full stop: stop the worker,
   replace every API replica with no canary overlay, then start the worker.
   Until every process runs B, an old one still resyncs (O7).
3. **Past losses.** Nothing records which rows were lost. Either accept that a
   revoked access token a resync brought back expires on its own within 24
   hours of the fix shipping, or rotate the JWT signing key at deploy, which
   ends every access token at once. Separately: whether to tell users.
4. **Order with v46.** The unmerged v46 branch also changes `pgWriter.ts`,
   `writeBehindQueue.ts`, `pgDescriptors.ts` and `store.ts`; whichever lands
   second rebases onto the other.
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

## The other findings

-   **S2.** `markEmailVerificationTokenSent`, `revokeEmailVerificationTokensForUser`,
    `deleteExpiredPasswordResetTokens` and `deleteExpiredEmailVerificationTokens`
    had no spec. A superseded verification token stayed consumable after a
    restart, and the sent time (which the resend cooldown reads) was lost. They
    are #39 to #42 above.
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

## Commits

On `claude/bmc-transmutation-strategy-6jenal-v49`, after `ff7d08bfa0`:

| Commit       | What                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `75b6060037` | Targeted statement primitives in `pgWriter` (U2, U3)                                                   |
| `2f5b92a5a1` | Receivers re-read changed keys by key, behind a per-key fence (X14, X16, X16b)                         |
| `0ca48db41b` | Computing an upsert's fence key never throws into the mutator                                          |
| `60203eb3a4` | The targeted kind, one transaction per call, the keyed deletes (#11, #16–29, #31, #33, #36, #38)       |
| `cbce376602` | The auth tables: #1–9, #12–15, #39–42 (X1–X5, X7, X13, X17, X19, U7)                                   |
| `111eabe39e` | Bounty, sweepers, mesh and coliseum: #10, #30, #32, #34, #35, #37 (X8, X8b, X9–X12, X11b)              |
| this commit  | Remove the resync; U1, U6, X1b, X7b, X8c; the prose, `KNOWN_LIMITATIONS.md`, the M11 note, this record |

Release A of the rollout (decision 2) is the receivers: the first three
commits. Release B is the rest.

## Documents corrected

-   `packages/api/src/db/store.ts`: the store's header said "durability is
    unaffected (the write is already committed to Postgres)". The store is
    write-behind: a mutator returns before its write runs, so a crash or a write
    that fails twice loses it. The header now says so, and says what is written.
    Two account-deletion comments explained keeping a row by the resync's danger;
    they now say the write is a single-row upsert.
-   `packages/api/src/db/pgDescriptors.ts` and `pgNotify.ts`: the header, the
    spec kinds and the `'r'` op describe what exists now.
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

Records written before this one (`api-findings-triage-2026-10-25.md`, D2: the
prune "as a resync of `revokedSessions`") are left as written; this record
supersedes them on the point.
