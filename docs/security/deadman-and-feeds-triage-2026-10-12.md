# Dead-man switch and event feeds — triage, 2026-10-12

Findings from the 2026-10-12 live-defect pass over the Blackout API and web
client, restricted to the dead-man switch, the module event feeds and the
stream goal. A finder ran the API in memory mode behind a fake homeserver and
probed it; a skeptic then re-ran every claim and read the code paths. Every
finding here gets a fix or a written reason, per the standing rule in this
directory. The scheduled-message findings from the same pass have their own
record.

Evidence file names below refer to the pass's working directory
(`live-defects/deadman-refute/`, `live-defects/capabilities-refute/`), which is
not in this repository. Each fixed finding also has a regression test that
drives the real Hono app, named below; those run in CI.

**Result:** D1, D3, D5 and C7 fixed; D2 fixed on the API and documentation
side, its product side (N2) decided on 2026-10-24 in
[`deadman-release-design-2026-10-24.md`](deadman-release-design-2026-10-24.md);
D4 and D6 closed on 2026-10-26 by that design's PR 1, which also fixed D7,
found while writing it; the governance and moderation feeds scoped, the others
left open with the reason.

| ID    | Finding                                                                                        | Verified                                  | Disposition                                                                     |
| ----- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| D1    | `GET /v1/deadman/events` returned every user's switch events                                   | Observed live; regression test            | Fixed: own switches only                                                        |
| D2    | Triggering delivers nothing, while the API said the payload "has shipped"                      | Observed live (0 outbound requests)       | Text fixed; N2 decided 2026-10-24                                               |
| D3    | Recipients could read `encryptedPayload` in every status                                       | Observed live; regression test            | Fixed: owner always, recipient after trigger; cancel clears it since 2026-10-26 |
| D4    | Check-in and cancel from the app are refused; the app cannot arm                               | Observed live; read                       | Closed 2026-10-26: `deadman.write` minted, the arm route refuses                |
| D5    | The panel refetched in a loop and used up the rate limit                                       | Observed (8,153 calls/s); regression test | Fixed: memoized actions                                                         |
| D6    | `process-overdue` accepts a caller-supplied `now`                                              | Read                                      | Closed 2026-10-26: route removed                                                |
| D7    | A recipient could follow the owner's check-ins and see the other recipients before the trigger | Read (2026-10-24, the release design §1)  | Fixed 2026-10-26: nothing before the trigger                                    |
| C7    | `GET /streams/:id/goal` had no owner check, while `/revenue` has one                           | Observed live; regression test            | Fixed: owner only                                                               |
| Feeds | The other process-wide `/events` routes, read with a default token                             | Read; regression tests                    | Governance ballots and moderation scoped                                        |

---

## D1 — the dead-man event feed showed every user's switches — fixed

-   **Found:** `GET /v1/deadman/events` returned the whole in-process event
    log for the module: every switch's owner, private room id, check-in
    times, and after the sweep the grace and triggered events, which also
    carry the recipient list. Every session token carries `deadman.read`
    (`deriveUserCapabilities` in `packages/api/src/services/auth.ts`), so no
    more than a sign-in was needed.
-   **Verified:** `probe-log.jsonl` seq 17: a stranger's token, 200, another
    owner's `deadman.switch.armed` events. The finder had not tested this one;
    the skeptic did.
-   **Fix:** the route requires the authenticated subject and returns only
    events whose `payload.ownerId` is the caller
    (`packages/api/src/modules/deadman.ts`). The module already had two
    precedents: the streaming feed is admin-only and the dead-drop feed
    carries drop ids only.
-   **Test:** `test/deadman-routes.integration.test.ts`, "the event feed shows
    each caller only the events of switches they own": after the sweep fires
    the switch, neither a stranger nor the named recipient sees the switch id,
    owner, room or recipient anywhere in their feed; the owner sees the armed,
    grace and triggered events, all with their own `ownerId`.
-   **Still open, low:** the event log lives in process memory and is never
    trimmed (`packages/api/src/modules/domain-events.ts`). It also empties on
    restart and differs between replicas. Not a confidentiality issue after
    the filter; left as it is.

## D2 — triggering delivers nothing; the API said the payload "has shipped" — text fixed, product side open

-   **Found:** when a switch moves to `triggered`, the server changes the
    status and records an in-process event, nothing else. The 409 returned
    for a check-in on a triggered switch said "Switch already triggered;
    payload has shipped", and the SDK and protocol comments described a
    release to recipients. The pass's claim that the web panel showed that
    text was refuted: the panel renders the SDK client's generic
    "Request failed (409) …" message, never the body.
-   **Verified:** `outbound.jsonl` recorded 0 outbound requests across the
    trigger; `probe-log.jsonl` seq 29 shows the 409 text;
    `render-probe-results.json` shows what the panel displays. Code:
    `sweepOverdueDeadmanSwitches` in `packages/api/src/modules/deadman.ts`
    calls `db.setDeadmanSwitchStatus` and `emitDomainEvent` only, and nothing
    in `packages/api/src` reacts to dead-man events.
-   **Fix here:** the 409 message is now "Switch already triggered". The SDK
    comment (`packages/blackout-sdk/src/deadman/actions.ts`) and the protocol
    header and field comments (`packages/blackout-protocol/src/deadman/events.ts`)
    now say that missing the grace window moves the switch to `triggered`
    and that the server does not publish or deliver the payload, and that the
    Matrix mirror events are defined but not sent by the API.
    `KNOWN_LIMITATIONS.md`, `README.md`, `docs/features/OVERVIEW.md`,
    `THREAT_MODEL.md` (§4, §5) and the C1 row of
    `docs/audits/pre-launch-readiness-audit-2026-07.md` say the same.
-   **Test:** "a triggered switch cannot be checked in or cancelled, and the
    refusal claims nothing was sent (D2)" in
    `test/deadman-routes.integration.test.ts` asserts the 409 code and
    message and that the message does not claim anything was shipped,
    published, delivered, released or sent. (Until 2026-10-26 the assertion
    lived in "process-overdue advances grace and triggered transitions",
    removed with the route, D6.)
-   **Open (N2):** what a switch should release, and to whom. Three options
    were laid out for the operator: hide the feature until it can release
    something; ship it honestly as a server-held release (mint
    `deadman.write`, an arming form with client-side encryption, recipients
    by Matrix id, a recipient view, and plain text that nothing is sent); or
    a real release (on trigger the bot posts a pointer, with the key material
    sealed to the recipients). No option is taken here: the feature stays
    visible and the limitations are documented.
-   **N2 decided, 2026-10-24:** the third option, as an owner-sealed release
    with notices from the bot; the design and its build plan are
    [`deadman-release-design-2026-10-24.md`](deadman-release-design-2026-10-24.md).
    Its PR 1 (2026-10-26) made today's behaviour true in the code and the
    documents: D4, D6 and D7 below, and the panel's text (§7 there).
-   **Deployment note:** in `deploy/docker/production` the sweep runs in the
    `worker` service, which at `1555912` did not load the store
    (`packages/api/src/worker.ts` started the loops without
    `initRuntimeStore`; only `src/index.ts` loaded it), so there a switch
    never fired at all. The audit ledger carries that correction. Fixed on
    2026-10-23: the worker boots through the API's own store boot
    (`packages/api/src/db/runtimeStoreBoot.ts`) before any loop starts,
    holds the background-leader lock, and drains on SIGTERM
    (`packages/api/src/backgroundWorker.ts`). Checked against Postgres 16,
    not against a deployment. Since no sweep had run there, its first
    working start reaches every switch whose deadline passed in the
    meantime; the backlog window below decides what happens to them.
-   **Backlog window (operator decision, 2026-10-23):** a switch the sweep
    reaches more than the backlog tolerance after it was due (15 minutes, or
    ten sweep intervals when a custom cadence makes that longer) is not
    acted on late: it goes to grace with its release moved to 72 hours from
    then, recorded in `backlog_grace_started_at` (migration 102), unless it
    already had that much grace left, in which case it goes to grace as it
    normally would. Once per missed check-in: a switch that had its window
    fires when it ends, however late the sweep is, and the owner's check-in
    clears the record. The window protects owners from a release the server
    caused by not watching, since a triggered switch's payload is readable
    by its recipients (D3); the cost is that whoever can stop the sweep
    across a deadline delays that release by the outage plus up to 72 hours
    (`THREAT_MODEL.md` R10). It applies to every outage, not only the first
    working deploy, because the reason is the same each time. The sweep's
    grace and triggered events stay in the memory of the process that ran
    it, so with a separate worker `GET /v1/deadman/events` on the app
    replicas does not list them; the switch's status and release time do
    show them. Tests:
    `test/deadman-scheduler.integration.test.ts`,
    `test/deadman-routes.integration.test.ts` and
    `test/deadman-backlog-postgres.integration.test.ts`.

## D3 — recipients could read the payload at any time — fixed

-   **Found:** `GET /v1/deadman/switches/:id` and
    `GET /v1/deadman/switches?scope=recipient` returned `encryptedPayload`
    to a named recipient while the switch was armed, in grace, and after the
    owner cancelled it. The protocol already said the payload is shown to
    recipients on release.
-   **Verified:** `probe-log.jsonl` seq 21 (recipient, armed switch, 200 with
    the payload) and later entries after cancel.
-   **Fix:** `recordToPayload(record, viewerId)` omits `encryptedPayload`
    unless the viewer owns the switch or the status is `triggered`; both read
    routes pass the caller, and the owner-only envelopes pass the owner. The
    protocol field is optional, with the rule in its comment, and the type
    guard accepts it missing. No shipped client renders the field.
-   **Test:** "a recipient gets the encrypted payload only after the switch
    triggers, never after a cancel": no payload while armed or in grace, in
    either view; the payload once triggered; never for a cancelled switch,
    while the owner's own cancel envelope still carries it.
-   **Since 2026-10-26 (PR 1 of the release design):** cancel clears the
    payload, so the owner's cancel envelope no longer carries it and that
    assertion changed; a second cancel clears the payload of a switch
    cancelled before this. Before the trigger a recipient now gets the same
    404 as a stranger (D7). Tests: "a recipient sees nothing before the
    trigger, and after it only the released view", "a cancelled switch never
    reaches its recipient, however long after (D3)" and "a default session
    token can check in and cancel its own switch, and cancel removes the
    payload" in `test/deadman-routes.integration.test.ts`.
-   **Notes:** release needs the sweep to run against the loaded store; where
    it does not, a recipient gets nothing, which is the fail-closed
    direction. `deploy/docker/production` did not until 2026-10-23 (D2).
    After a sweep outage a lapsed switch gets the backlog window before it
    can release (D2). Recipients are matched by Blackout account id; a
    recipient named by Matrix id or room id never matches a reader. That is
    part of N2.

## D4 — check-in and cancel from the app are refused; the app cannot arm — closed 2026-10-26

-   **Found:** session tokens carry `deadman.read` only; `deadman.write` is
    minted nowhere, so the panel's check-in and cancel get 403
    `missing_capability`. The panel has no arming form: `handleArm` is wired
    but nothing calls it. Ownership checks hold: a signed-in user cannot
    check in, cancel or sweep another user's switch.
-   **Verified:** `probe-log.jsonl` seq 5 (arm, 403) and seq 28 (check-in,
    403); ownership by the existing tests "only the owner can check in or
    cancel a switch" and "deadman.write capability is required to arm a
    switch".
-   **Disposition:** open, waiting on N2. Minting the scope only makes sense
    together with an arming flow and a recipient model. Meanwhile
    `KNOWN_LIMITATIONS.md` says the app can show switches but not arm,
    check in or cancel.
-   **Closed 2026-10-26:** `deriveUserCapabilities` mints `deadman.write`.
    Every route behind it acts on the caller's own switches, and
    `POST /v1/deadman/switches` answers 409 `arming_unavailable` to every arm
    until the release design's PR 4 (its §8, "`deadman.write`"). The panel
    checks in and cancels with a default token, says that a new switch cannot
    be armed yet, and no longer points at an SDK call or an arming form; the
    unused `useDeadmanSwitch` hook and the SDK's `createDeadmanMatrixActions`,
    which would have mirrored a switch into unencrypted room state, are
    deleted. Tests: H-1 and H-8 in `test/capability-header.integration.test.ts`;
    "arming is refused with 409 arming_unavailable before the body is read,
    and writes nothing" and "a default session token can check in and cancel
    its own switch, and cancel removes the payload" in
    `test/deadman-routes.integration.test.ts`.

## D5 — the panel's request loop — fixed

-   **Found:** `DeadmanSwitchPanel` called `createDeadmanActions(apiClient)`
    on every render, so `refresh` had a new identity each time and the mount
    effect re-ran after every fetch. One mounted panel made 8,153 list calls
    in one second against a fake client, and 120 calls then 429s within three
    seconds live. The same refetch cleared a check-in error alert within
    milliseconds of it appearing.
-   **Verified:** `render-probe-results.json` (phases A to C).
-   **Fix:** the actions object is memoized on the injected client
    (`apps/blackout-client/src/app/features/deadman/DeadmanSwitchPanel.tsx`);
    `routes.ts` already memoizes the client on the token.
-   **Test:** `apps/blackout-client/tests/unit/features/deadman/DeadmanSwitchPanel.test.tsx`:
    exactly one list call on mount, and after a failed check-in the alert is
    still on screen with no refetch behind it.

## D6 — `process-overdue` takes the caller's clock — closed 2026-10-26

-   **Found:** `POST /v1/deadman/process-overdue` accepts an optional `now`
    and evaluates the caller's switches against it. The route filters to the
    caller's own switches, so the only effect is firing one's own switch
    early, which the owner can also do by not checking in.
-   **Verified:** read (`processOverdueSchema` and the owner filter in
    `packages/api/src/modules/deadman.ts`); the existing test
    "process-overdue advances grace and triggered transitions" uses the
    parameter.
-   **Disposition:** left as it is. Whether the route survives, and in what
    form, follows from N2.
-   **Closed 2026-10-26:** the route is removed, with the SDK's
    `processOverdue`; the sweep is the only code path that moves a switch
    (release design §8, PR 1). Test: "POST /process-overdue is gone (D6)".

## D7 — a recipient could follow the owner's check-ins before the trigger — fixed

-   **Found:** `GET /v1/deadman/switches?scope=recipient` and
    `GET /v1/deadman/switches/:id` returned every switch that named the
    caller, in every status, with the owner id, room id, interval, grace,
    `lastCheckInAt`, `triggerAt`, `releaseAt`, every recipient and the label.
    D3 closed the payload, not this: before anything fired, a recipient could
    watch when the owner checked in and learn who else was named. Found on
    2026-10-24 while writing the release design (its §1, "What a recipient
    can read").
-   **Verified:** read; the old test "a recipient gets the encrypted payload
    only after the switch triggers, never after a cancel" read an armed switch
    as its recipient and got 200 with the metadata.
-   **Fix (2026-10-26, PR 1 of the design):** a recipient is answered exactly
    like a stranger until the switch has triggered: 404 `switch_not_found`
    from the single read, and nothing in the list. After the trigger both
    return `DeadmanReleasedSwitch`
    (`packages/blackout-protocol/src/deadman/events.ts`): switch id, owner
    id, status, release time and payload, with no check-in history, interval,
    room, label or other recipients. The same 404 answers an unknown id,
    someone else's switch and a recipient's switch before the trigger, so an
    id does not reveal whether a switch exists.
-   **Test:** "a recipient sees nothing before the trigger, and after it only
    the released view" and "anyone but the owner gets the same 404, whether
    the switch exists or not" in `test/deadman-routes.integration.test.ts`.

## C7 — a stream's goal progress was readable by any signed-in user — fixed

-   **Found:** `GET /v1/streaming/streams/:id/goal` needed only
    `streaming.read`, which every token has, while `/revenue` on the same
    stream is owner-only. The goal's `achievedCents` is the stream's captured
    gross tip revenue, the figure `/revenue` protects. The caller also chose
    `targetCents`, and each new target can fire a `streamgoal.reached`
    webhook to the creator's subscriptions
    (`packages/api/src/services/streamGoals.ts`).
-   **Verified:** `capabilities-refute/goal.json`, `goal2.json`, `rev2.json`:
    403 on `/revenue` against 200 on `/goal` for the same stranger. The
    revenue figure in the probe was 0, so the exposure was shown by the
    status codes and the code path, and by the regression test with a
    captured tip.
-   **Fix:** `requireStreamOwner`, like `/revenue`
    (`packages/api/src/modules/streaming.ts`). An unknown stream id now gets
    404 `stream_not_found`, as at `/revenue`; before, the route answered 200
    with a zero figure for any id. No shipped view calls the route:
    `streamRevenueApi` in the client's `monetizationApi.ts` has no importers.
-   **Test:** `test/security-hardening.integration.test.ts`, "C7: GET
    /streams/:id/goal is owner-only, like /revenue": with a 2,500-cent
    captured tip on the stream, a stranger gets 403 and no figure; the owner
    gets 200 with `achievedCents` 2500, and 404 for an unknown stream id.
-   **Later:** a public progress bar, if wanted, needs a target the creator
    sets and percent-only output.

## Feeds — the other `/events` routes read with a default token

The rule applied, from the dead-man precedent: a feed that exposes another
user's private data (anything the module's open reads do not already return
to the same token) is scoped or closed; a feed whose rows repeat open data or
carry ids only stays as it is. Every emitter in `packages/api/src` was read
to see what each feed carries.

| Feed                                      | What the rows carry                                                                                                                                                 | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/v1/deadman/events`                      | owner, room, recipients, status changes                                                                                                                             | Own switches only (D1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/v1/governance/events`                   | `vote.cast`: voter and choice. `proposal.created`: proposal id, community, scope. `meeting.scheduled`: the meeting object. `treasury.*`: the snapshot or milestone. | Ballots are shown to their own voter only: nothing else in the API ties a choice to a voter (the proposal read returns the tally). The rest stays, because the same token reads it through `GET /proposals/:id`, `/meetings` and `/treasury/*`, and the legacy mobile governance tab builds its proposal list from `proposal.created` events (`packages/mobile/app/(tabs)/governance.tsx`). That tab's "Recent governance events" list now shows a ballot event only to the member who cast it; its proposal list is unchanged. |
| `/v1/moderation/events`                   | `action.taken`: action id, target, action (no community). `stream.chat.updated`: stream id, slow-mode seconds, banned-user and keyword-filter counts.               | Admin-only, like `/v1/streaming/events`. `GET /moderation/actions?communityId=` already returns a community's actions, target and actor included, to any token that names the community (the open item below); what the feed added was a cross-community listing with no community filter, plus the stream-chat counts that the owner-only stream moderation read protects. No shipped client reads it (`getModerationEvents` in `packages/blackout-sdk/src/client/queries.ts` has no importers).                               |
| `/v1/forum/events`                        | post id, community id                                                                                                                                               | Left open: no author in the row, and the same token reads the post itself, author included, through `GET /forum/posts?communityId=`.                                                                                                                                                                                                                                                                                                                                                                                            |
| `/v1/deaddrop/events`                     | drop id                                                                                                                                                             | Left open: ids only, by design (the comment in `deaddrop.ts`); the open route is bound to the authenticated recipient, so knowing an id opens nothing.                                                                                                                                                                                                                                                                                                                                                                          |
| `/v1/streaming/events`                    | the streaming log                                                                                                                                                   | Already admin-only before this pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/v1/discovery/events`, `/v1/apps/events` | fixed data: `{ module, status }`, and the catalogue of app event type names                                                                                         | Not activity logs; pinned so a later change shows up.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Modules that emit domain events without a listing route (feed, profile, stego,
settings, monetization, coalitions) are unchanged.

**Open:** `GET /v1/moderation/actions?communityId=` returns a community's
action records, target and actor included, to any session token: every token
carries `moderation.read`, and the module has no community membership or role
model (the follow-up already noted in `packages/api/src/modules/moderation.ts`).
The admin-only feed does not change that. FEED-6 pins the current behaviour so
this record stays true; closing it waits on that role model.

**Tests:** `test/security-hardening.integration.test.ts` FEED-1 to FEED-5 (a
stranger does not see another member's ballot while the voter still does;
meeting events equal the open meeting list; the forum row names no author and
the post is open anyway; dead-drop rows carry ids only and the id opens
nothing; the moderation log is 403 for a default token and readable by an
allowlisted admin, whose action rows carry action id, target and action only;
the per-community `GET /moderation/actions` read is open to every token, as
above), and `test/module-bootstrap.integration.test.ts` for the two fixed-data
routes.

## Documentation corrected with this record

-   `KNOWN_LIMITATIONS.md`: new "Dead-man's switch (experimental)" entry.
-   `README.md`: the switch is marked experimental, pointing at that entry.
-   `docs/features/OVERVIEW.md`: no configurable consequences; nothing is sent;
    recipients read the payload only after it fires.
-   `THREAT_MODEL.md`: §4 asset and §5 posture row for dead-man switch records.
-   `docs/audits/pre-launch-readiness-audit-2026-07.md`: C1 is partly fixed,
    with the re-check note.
-   `packages/blackout-protocol/src/deadman/events.ts` and
    `packages/blackout-sdk/src/deadman/actions.ts`: comments as under D2.
-   2026-10-26, PR 1 of the release design: `KNOWN_LIMITATIONS.md` (check-in
    and cancel work; arming is closed; cancel clears the payload,
    and deletion clears it for a switch that has not fired;
    recipients see nothing before the trigger), `THREAT_MODEL.md` §5 (the
    payload is whatever the caller sent), the C1 note in
    `docs/audits/pre-launch-readiness-audit-2026-07.md`,
    `docs/features/OVERVIEW.md`, and
    [`capability-header-triage-2026-10-23.md`](capability-header-triage-2026-10-23.md)
    (`deadman.write` minted).
