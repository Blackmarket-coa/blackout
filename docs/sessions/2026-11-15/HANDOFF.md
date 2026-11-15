# Session handoff, 2026-11-15

Where the Blackout work stands at the end of a long working session, what the
operator still has to do, and what the next session picks up. Everything here
was checked against the repository at the time of writing (develop at
`ee27e3e479`). The other files in this directory are the material the next
steps need; they were in the session's scratch space and would otherwise be
lost.

The Free Black Market, Blackstar and blackmask repositories have no open work
from this session.

**Where this handoff lives.** On branch
`claude/bmc-transmutation-strategy-6jenal-session-handoff` of the Blackout
repository, in `docs/sessions/2026-11-15/`. The two advisory texts are not
committed: the repository is public and the advisories were not yet published
when this was written. They were sent to the operator with this handoff.

## 1. Where things stand

-   **Merged into `develop` on 2026-11-15:** #1009 (Python and Rust lockfile
    advisories), #1008 (the key-backup nudge no longer opens a setup that deletes
    the account's key backup), #1010 (hono 4.13.16, @hono/node-server 2.1.6, and
    the guard that stops an unclaimed WebSocket upgrade from ending the API
    process), #1011 (a dropped Postgres connection no longer ends the API or
    worker process). `develop` is `ee27e3e479`.
-   **Open pull requests:** none.
-   **#1011 was merged at its eighth review round.** Its ninth round was still
    being built and is on branch `-v66` (section 4.1). So `develop` still has
    one narrower defect: when the server ends several of a process's
    connections at once (a failover, or every backend of the role terminated)
    while a write is in flight, the write's single retry can be handed another
    connection that died in the same instant, and that write is lost although
    Postgres is up and the request was answered. Measured: 32 of 160 writes in
    that scenario. Before #1011 the same event ended the process and lost the
    whole queue.

## 2. For the operator

1. **Publish the two security advisories.** This session could not: GitHub's
   proxy refuses writes to the security-advisory API for it (HTTP 403), though
   the account is an admin. Create each from the repository's Security tab
   (Security, Advisories, New draft security advisory) and publish it. The
   texts were sent to the operator with this handoff and are not committed
   here; each ends with a note on filling in the form:
    - `advisory-store-cross-process-writes.md` (the store fix, #1003, merge
      `25d7129c0c`; CVSS 3.1 `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H`, CWE-362,
      CWE-613);
    - `advisory-register-account-collision.md` (the `/register` fix, #1004,
      merge `66523abd9f`; CVSS 3.1 `AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`,
      CWE-639, CWE-841).
      Use the sections from the bullet list through "After upgrading" as the
      description, and leave out the note for the operator.
2. **Done at the operator's instruction:** the two branches that existed only
   in the session's container are on GitHub:
   `claude/bmc-transmutation-strategy-6jenal-v46` (dead-man release part 2,
   head `ec5ec2575b`) and `claude/bmc-transmutation-strategy-6jenal-v51`
   (store PR 2, head `99bf183067`). Neither is a pull request. `ci.yml` runs
   on every branch push; the head of `-v46` sits on a work-in-progress commit
   (section 4.3), so its run may fail, and that is expected until round 23 is
   finished.
3. **At the deploy that ships the store fix** (decision B, confirmed): rotate
   `JWT_SECRET_PRIMARY`. Set `BLACKOUT_ATTRIBUTION_SECRET` to the current
   `JWT_SECRET_PRIMARY` value first if it is unset, and do not put the old
   value in `JWT_SECRET_ROLLOVER`. Deploy by hand with a full stop (no canary,
   no rolling replacement: old and new store code must not share a database).
   Then remove the interim measures each advisory's "After upgrading" names
   (`BLACKOUT_AUTH_ROWS_PRUNE=0`, the single-process override, the proxy's 503
   on `/register`).
4. **Rebuild the perturbation sidecar** after #1009 (`deploy.sh` does not):
   `docker compose build perturbation && docker compose up -d perturbation`.
5. **GitGuardian incidents 39325481, 39067827 and 40095888:** each flags a test
   value (test-vector property names; the made-up public key in
   `apps/blackout-client/tests/unit/helpers/fakeKeyHomeserver.ts`). Close them
   as false positives in the dashboard if you agree. Not answered yet.

## 3. Decisions taken on 2026-11-15

| Item                                                                   | Decision                                                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A. The two advisories                                                  | Publish both (operator's step, section 2)                                                                                           |
| B. Rotate `JWT_SECRET_PRIMARY` at the store-fix deploy                 | Yes                                                                                                                                 |
| C. eslint 8 to 10 (`-v54`)                                             | Parked                                                                                                                              |
| Dead-man 20. Remove fired legacy switches after 365 days               | Leave as is                                                                                                                         |
| Dead-man 24. Rows of a cancelled release switch                        | Delete after 365 days (to build)                                                                                                    |
| Dead-man 25. The notices room alias's key                              | A secret of its own, never rotated with `JWT_SECRET_PRIMARY` (to build)                                                             |
| Dead-man 26. Wait for an incomplete notices room                       | Confirmed as built                                                                                                                  |
| Dead-man 32. Deletion can leave a switch armed in four cases           | Keep documented; no check built                                                                                                     |
| Dead-man 33. Deletion waits at most 30 s for the owner's arms          | Confirmed                                                                                                                           |
| Dead-man 34. Retry a refused attempt's carry every 10 s                | Confirmed                                                                                                                           |
| Dead-man 35. Timeouts on the shared Postgres pool                      | Option (b): TCP keepalive and a connection timeout, as a change of its own to `develop` (to build); the carry's 5 s bound confirmed |
| Dead-man 36. A failed write that cannot be read back counts as a stall | Option (a), as built                                                                                                                |
| Dead-man 37. Which database errors are "refused, nothing applied"      | Option (a), as built: SQLSTATE classes 22, 23, 42 with severity `ERROR`                                                             |

The dead-man record on `-v46` (`docs/security/release-envelope-2026-10-26.md`,
"Decisions for the operator to confirm or veto") marks each of these where it
stands (commit `ec5ec2575b`). Decision 19 (no order on release identities) stays
open as written.

## 4. What to pick up, in order

### 4.1 `-v66`: finish the write-retry follow-up to #1011, then open its PR (pushed)

Branch `claude/bmc-transmutation-strategy-6jenal-v66`, from `develop`
`ee27e3e479`, head `7c3a884e3c`.

-   `2b54028fa1` merges the ninth round (commits `9ce2db7018`, `a0ccab913d`,
    `f6f99c6c94`, `50c62f250b`): a write whose connection had ended is tried
    again past every pooled connection the server ended with it. In the
    mass-termination scenario: 0 of 280 writes lost (32 of 160 before).
-   Its review (`review-write-retry-round9.md`) found **one medium, a regression
    of that round**: after a failed attempt the queue asks the connection one
    more question (`SELECT 1`), and that never settles where node-postgres failed
    the statement inside the client (a value it cannot serialize: bind throws,
    no Sync is sent, the client keeps the statement as its active query). The
    write-behind queue then stops for good with no log line. `develop` does not
    have this: there the write is logged as failed and the queue goes on. No
    HTTP request was found that produces such a value. Also: the stated bound of
    12 attempts is 13 where another caller waits for a connection; three stale
    test comments; a comment untrue when `DATABASE_URL` carries `query_timeout`;
    the false "the env check refuses PORT=0" sentence in two more test files.
-   `7c3a884e3c` is a **work-in-progress commit**: the edits of an agent that was
    fixing those findings and was stopped by a usage limit. It typechecks;
    nothing else was run on it. Read it critically against the review, finish
    it, then run the reproduction and the gates (below), get it reviewed, and open
    the pull request. Its description must say it carries #1011's ninth round.

### 4.2 `-v67` (new): decision 35 (b), keepalive and a connection timeout on the shared pool

From `develop`. In `packages/api/src/config/postgres.ts` give the shared pool
TCP keepalive (`keepAlive`, `keepAliveInitialDelayMillis`) and a
`connectionTimeoutMillis`. What it bounds and what it does not is in decision
35 of the dead-man record: keepalive ends a connection waiting on an
acknowledged statement once the database's host has gone silent (a lost host,
a network fault), not a database process that stops answering on a host that
stays up; the connection timeout bounds a connection that is never made.
#1011's handling of a dropped connection covers the errors keepalive produces.
Measure the bound on real PostgreSQL (the review measured 12.3 s with a 2 s
delay), update `KNOWN_LIMITATIONS.md` ("Dropped Postgres connections") and the
dead-man record's decision 35 once built.

### 4.3 `-v46`: dead-man release part 2, round 23 (pushed; not a pull request)

Branch `claude/bmc-transmutation-strategy-6jenal-v46`, head `ec5ec2575b`. Behind
`BLACKOUT_DEADMAN_RELEASES`, which is off everywhere and must stay off. Pushed
on 2026-11-15; it is not a pull request until its review is clean.

-   Rounds 1 to 22 are committed. Round 22 (`f7fe06925b`) passed the full gate
    runner: API PR suite 2,219 of 2,219, post-merge 2,339 of 2,339, launch smoke
    14, client 3,643 passed and 3 skipped, and the rest.
-   `fd3d043adf` merges `develop` `ee27e3e479` (#1008, #1010, #1011).
-   `fd284142d1` is a **work-in-progress commit** of round 23, stopped by a usage
    limit: the start of making every connection this branch checks out follow
    #1011's rule (through `withPooledClient`, or an `'error'` listener while held
    and a failed connection given back with `release(err)`), with a new test file
    `test/deadman-pool-checkouts.integration.test.ts`. It typechecks; nothing
    else was run.
-   `ec5ec2575b` records the decisions of section 3.
-   **Round 23 still to do** (`review-deadman-round22.md` has each finding with
    its evidence):
    1. Finish the pool-checkout work above and cover each kind of checkout with a
       test that fails without it; run both sides' tests after the merge
       (develop's `pg-pool-client-errors`, `in-process-background-loops`,
       `websocket-upgrade-guard` among them); reword every pointer to "-v62" (it
       is #1011, merged) and record the merge in a "Round 23" section.
    2. **The medium (decision 31):** a check-in or cancel refused on an API
       process is not written onto the switch where that process's view is
       behind a check-in the database already carried out (its own, carried out
       and never answered), because the carry, the end of the note after a
       refused carry and the sweep's own-note logic compare against the check-in
       the attempt read. The release then fires at its deadline with no backlog
       window. Decide on moments instead: carry where the row's last check-in is
       earlier than the attempt; the sweep keeps its note where the note is after
       the row's last check-in; a check-in clears the refused-attempt column only
       where the column is not later than that check-in's own moment. Test both
       orders, with mutants.
    3. The sweep's announcement of a cancelled switch has three gaps: it never
       reaches a legacy switch (no sealed copy), another process that blanks the
       copies first uses up its only trigger, and it is made only with the
       blanking statement's own answer.
    4. Lows: a test that a statement landing after its bound logs no refusal
       line; three user-facing sentences qualified; "short of deleting the
       account"; the record's list of tracked files carrying a model name.
-   **Round 24:** build decisions 24 (delete a cancelled release switch's rows
    after 365 days) and 25 (the alias's own secret: a new environment variable,
    validated at boot, in `.env.example`, `tools/ci/check-auth-secrets.mjs` if it
    applies, and the record), then answer round 23's review.
-   Keep the record's "An aside found while probing round 6" paragraph as it is.

### 4.4 `-v57`: sign-out and the session list in the shipped app

Approved work, unblocked now that #1008 is on `develop`. Nothing is built; the
design is `design-signout-and-session-list.md` (decisions, where the user
reaches it, what "sign out of this device" does step by step, ending another
session, exact strings and why each is true, tests, records, file list). Start
a new branch from `develop`.

### 4.5 `-v68` (new): two shutdown and leadership gaps found during #1011

-   SIGTERM under keep-alive traffic can exit before the store drains.
-   An API replica that did not get the background-leader lock when it started
    never tries again (`KNOWN_LIMITATIONS.md` on `develop` says so), so after a
    lost leader the loops restart only if the old leader is still running or a
    worker is on standby.

### 4.6 `-v51`: store PR 2 (pushed; not a pull request)

Branch `claude/bmc-transmutation-strategy-6jenal-v51`, head `99bf183067`, four
commits on top of the store fix's branch as it stood before #1003 merged. The
design is `design-store-pr2.md`: patch and insert-only kinds on the security
tables, a middleware check that the token's account still exists (O6), a CI job
on real PostgreSQL, the S7 specs, and D1's text. Built up to its step C2; it
needs `develop` merged in first (`develop` now carries #1003 and #1011).
Approved follow-ups stacked on it: an alert rule (Q6), a migration for
`users.email_verified_at` and `votes.result`/`resolved_at` (Q2), re-keying
`creator_stream_auth` by creator id (Q11), and a required check once merged
(Q8, which the operator sets in branch protection). Item S7 (four store methods
with no spec never reach Postgres: `resolveVote`, aid posts, campaign
attribution and engagement) is part of it; check it against `develop`'s
`store-spec-coverage` test first.

### 4.7 `-v54`: eslint 8 to 10 (pushed, parked by decision C)

Branch `claude/bmc-transmutation-strategy-6jenal-v54`, head `00e5d610f5`. Leave
it until the operator unparks it.

## 5. Rules the work ran under

-   Base every pull request on `develop`. Work only on branches named
    `claude/bmc-transmutation-strategy-6jenal-*`; a merged PR's branch is
    finished. Never merge a pull request; never rebase, amend or force-push;
    bring `develop` into a branch with a merge commit.
-   Never skip, disable or quarantine a test; no empty commits; no close and
    reopen to start CI. Never set a feature flag anywhere
    (`BLACKOUT_DEADMAN_RELEASES` stays off). Never dispatch
    `blackout-desktop-tauri.yml`: it publishes a release.
-   Safety and privacy claims must be true and checked. Security findings are
    fixed or explained in `docs/security/`, never baselined. Fork changes outside
    `blackout_runtime/` go in `apps/blackout-server/PATCHES.md`. nginx changes
    need `nginx -t` and a `curl -I` check per location.
-   No model name in code, documents or pull request text; only in the commit
    trailer line. Each GitHub comment ends with the "Generated by Claude Code"
    footer; each pull request description ends with the session footer.
-   On a CI failure of a PR this work opened: one comment saying what fails and
    why it is or is not the PR's; a job gets at most one re-run.
-   Heavy suites one at a time, with the 1-minute load under 3.5; stop only
    processes you started, by PID (never `pkill` by pattern: worktrees share test
    file names); make probe edits in a scratch copy of the tree, never in a
    worktree another agent may be running from.

## 6. How the work was checked

Each change went through rounds: one agent built it (reproduce first, fix,
tests shown failing without the fix, mutation checks, the full gates), then two
or three independent reviewers checked it (one reproducing and attacking the
running code, one checking every sentence and test against the code), and the
next round answered every finding in code or by making the sentence true. The
gates for the API, as CI runs them, are in `.github/workflows/ci.yml`:
`pnpm --filter @blackout/api lint`, `typecheck`, `test:integration` (with
`BLACKOUT_DB_MODE=memory`, `BLACKOUT_API_SKIP_LISTEN=1`, `NODE_ENV=test`), the
post-merge suite `pnpm --filter @blackout/api test`, `test:launch-smoke`,
osv-scanner on `pnpm-lock.yaml` with `osv-scanner.toml`, Trivy, Gitleaks.
The real-PostgreSQL tests run only where `BLACKOUT_TEST_PG_URL` is set, which
no CI workflow does; run them against a throwaway PostgreSQL 16.

## 7. Files in this directory

| File                                 | What it is                                                       |
| ------------------------------------ | ---------------------------------------------------------------- |
| `HANDOFF.md`                         | This document                                                    |
| `review-write-retry-round9.md`       | The ninth round's report and its review: what `-v66` must answer |
| `review-deadman-round22.md`          | The round-22 review of `-v46`: what round 23 must answer         |
| `design-signout-and-session-list.md` | The design for `-v57`                                            |
| `design-store-pr2.md`                | The design for `-v51`                                            |

The two advisory texts (`advisory-store-cross-process-writes.md`,
`advisory-register-account-collision.md`) were sent to the operator with this
handoff and are not in the repository. Paths under `/tmp` in the review files
were the session's scratch space and no longer exist.
