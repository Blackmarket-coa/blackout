# Encryption audit — 2026-08-10

**Scope.** Verify the encryption claims Blackout intends to publish on a public
trust page: that end-to-end encryption is on by default, that it is never behind
a paywall, that no bot or moderation tool can read encrypted room content, and
that no server-side log captures message plaintext.

**Verdict.** One of the four claims was false as written, one was true but had no
live home, and two held up. The false one — "E2EE is on by default" — was false
in thirteen server-side room-creation paths and five client paths, and the
homeserver was not compensating. All of it is fixed in this branch except the
key-backup decryption defect, which is instrumented but **not resolved**.

**Audited by:** `claude/blackout-encryption-audit-50jhwx`, from `origin/develop`
at `ed54743`.

---

## Scope limits — read before relying on this

This audit was performed **against the source repository only**. The environment
had no access to the live stack: `/opt/blackout-infra/` does not exist on the
audit host, and no live Synapse, Postgres, or running container was reachable.

Two requested items therefore **could not be executed**, and are delivered as
host runbooks in §6 rather than as changes:

1. Rotating the `MATRIX_BOT_TOKEN` hardcoded in the live
   `docker-compose.override.yml`, and the live DB credentials.
2. Reproducing the live key-backup `DecryptionError`.

Neither is fixed by this branch. Anyone reading this report as evidence for a
public claim should treat §6 as open work.

Also worth stating plainly: **no un-suffixed `docker-compose.override.yml` has
ever been tracked in this repository** (`git log --all --diff-filter=A` returns
nothing; only `infra/single-server-baseline/docker-compose.override.yml.example`
exists, and it already interpolates every secret). The hardcoded token is a
property of the live host's untracked file. What this repo could do about it is
§4.3.

---

## 1. Verified safe — no change needed

### 1.1 E2EE is genuinely not paywalled

This one holds up, and it holds up structurally rather than by policy.

The complete catalogue of paid gating is the seven per-family tier tables unioned
in `packages/blackout-protocol/src/entitlements/bundles.ts:30-38` — deaddrop,
persona, hardening, transparency, activedefense, shield, mesh. **None contains an
encryption key.** There is no `features.e2ee.*` or `features.encryption.*` key
anywhere in the protocol package, so there is no lever a billing change could
pull even by accident.

The one encryption-related flag is a _preset_ key, not an entitlement:
`packages/core/src/feature-presets.ts:60` sets `features.security.e2eeDefaults:
true` in the `STARTER` baseline; `GOVERNANCE` spreads `...STARTER` and
`SOVEREIGNTY` spreads `...GOVERNANCE`, and neither overrides it. Presets are
additive, so every tier gets it.

Free-tier deaddrop is a working encrypted deaddrop
(`packages/blackout-protocol/src/deaddrop/entitlements.ts:84-86`), with the
module's own header stating paid tiers add capability and are "never mere
unlocks of the same code path" (`:8-11`).

**One nuance the trust page must respect.** E2EE is free; _privacy_ is not
uniformly free. Tor transport, decoy traffic, image perturbation, persona
compartments and rotation, deaddrop anonymity padding / decoys / cover-sender,
mesh transport, and active defense are all paid. Free deaddrop is capped at 64 KB
payload, 24 h retention, 1 recipient, 0 decoys
(`deaddrop/entitlements.ts:44-73`). "E2EE is never paywalled" is true. "Privacy
is never paywalled" would not be, and must not be written.

### 1.2 No bot or moderation tool can read encrypted room content

The bot's read surface is **state and membership only**. Searched for
`/messages`, `/context/`, `/relations`, `/sync`, `initialSync`, and `scrollback`
across `packages/api/src`, `apps/deaddrop-appservice`, and
`packages/blackout-sdk`: **zero timeline-read call sites.** What exists is
`getStateEvent` (`matrix-client.ts:758`), `getRoomStateEvents` (`:785`, filtered
by type), and `getRoomMembers` (`:562`).

There is no moderation, report-triage, or abuse-handling code that reads existing
room events. The bug pipeline is write-only: `services/bugRoomPipeline.ts:386-397`
composes a message from HTTP form input and posts it, never fetching the
timeline.

The bot does hold broad Synapse admin powers — force-join any local user
(`:472`), read any room's state without membership (`:520`), deactivate accounts
(`:683`), purge rooms (`:717`). These let it manage rooms; none of them decrypt
anything. That distinction is what makes the claim survivable, and it is worth
stating precisely on the trust page rather than claiming the bot is powerless.

**The honest caveat:** the bot does not need to read encrypted rooms, because for
_unencrypted_ paths plaintext is handed to it directly.
`packages/api/src/routes/messages.ts:30-66` accepts `content` over HTTP and
stores it, and `services/scheduledMessageDispatcher.ts` stores scheduled message
bodies plaintext at rest (`db/types.ts:716-731`). Those are unencrypted rooms —
nothing is being decrypted — but "the server never holds plaintext" would be a
false statement. "The server cannot read your encrypted rooms" is the true one.

### 1.3 No log path captures message content

Confirmed by search across `packages/` and `apps/` (excluding the vendored
Synapse tree): no `logger.*` or `console.*` call passes a Matrix event body or
`content.body`. Every API log record already passes `redactObject`
(`telemetry/logger.ts:24-25`).

No PostHog, Segment, or session-replay integration exists anywhere in the repo.
OpenTelemetry is optional and off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
The bug-report pipeline scrubs user-supplied text before posting
(`bugRoomPipeline.ts:150-181`).

This was true when audited, but it was true by habit rather than by construction
— see §4.1 for what was done about that.

### 1.4 Committed compose files do not contain secrets

All eleven compose files interpolate rather than inline:
`MATRIX_BOT_TOKEN=${MATRIX_BOT_TOKEN}`
(`infra/single-server-baseline/docker-compose.yml:121`), `JWT_SECRET_PRIMARY`
(`:112`), Postgres/Redis/ClickHouse passwords, LiveKit keys. Production uses
file-based Docker secrets (`DB_PASSWORD_FILE: /run/secrets/db_password`). A
repo-wide grep for a literal `syt_` token found only `.env.example` placeholders
and the `syt_test_admin_token` test fixture. One exception is §4.4.

---

## 2. Broken — the E2EE-by-default claim

This is the finding that blocks publication, and it was broken at every layer at
once, which is why nobody noticed: each layer looked like it was someone else's
job.

### 2.1 The homeserver was not enforcing anything

`encryption_enabled_by_default_for_room_type` appeared in **no deployable
config**. Checked all four rendered templates — `infra/single-server-baseline/`,
`deploy/docker/blackout-backend/`, `apps/blackout-server/services/`, and
`apps/blackout-server/docker/conf/`. The identifier existed only in upstream
Synapse source and its own tests.

Effective value was therefore the upstream default, **`off`**
(`apps/blackout-server/synapse/config/room.py:38-41`). The homeserver would not
have backfilled encryption for any of the paths below.

### 2.2 The API could not create an encrypted room at all

`packages/api/src/integrations/matrix-client.ts:197` accepted no `initial_state`
parameter. Not "defaulted to unencrypted" — there was **no expressible way** for
any caller in `packages/api` to create an encrypted room. The only available
remedy was a post-hoc `sendStateEvent`.

Thirteen call sites created plaintext rooms, including FBM vendor order,
inventory, ledger and buyer-order rooms; imported Discord guilds and channels;
private plugin dens; and tier-gated coalition dens.

### 2.3 The two paths that did encrypt did it unsafely

`services/fbmMatrixBridge/disputeRooms.ts:42-54` and `deadDropDelivery.ts:59-75`
created the room and _then_ sent `m.room.encryption`. Two defects:

1. The room existed unencrypted between the two calls.
2. **The result was never checked.** A 403 or 5xx left the room permanently
   plaintext while execution continued to invite the buyer, vendor, and mediator
   and post into it.

### 2.4 The client's defaults disagreed with each other

-   `features/create-room/CreateRoom.tsx:75` — the main create-room modal
    defaulted the encryption toggle to **`false`**.
-   `features/canopy/denKind.ts:116` `createDenInCanopy` — the primary
    Discord-style channel-creation path, and the one most users hit, passed no
    encryption state at all. Every den was plaintext.
-   `features/navigation/QuickSwitcher.tsx:557` created an **unencrypted DM**,
    while `friendActions.ts`, `useProfileActions.ts`, and the `/dm` command all
    created encrypted ones. Its own comment claimed it mirrored
    `friendActions`' `ensureDmRoom`; it had drifted from it. **The same DM was
    encrypted or not depending on which UI you started it from, and nothing showed
    the user which.**
-   `features/canopy/useDiscussionDen.ts:96` and
    `features/streaming/kits/applyKit.ts:92-99` — no encryption field, so
    `undefined`, so plaintext.

### 2.5 The threat model already claimed otherwise

`THREAT_MODEL.md:50` states the homeserver is "untrusted for content
(Megolm/Olm protect plaintext)" and `:75` lists message plaintext as protected by
Megolm. For the paths above that was not true. `KNOWN_LIMITATIONS.md` contained
**zero** occurrences of `e2ee`, `encrypt`, `decrypt`, `key backup`, or
`megolm`, and `KNOWN_ISSUES.md:42` was literally `_none yet_`. The gap was
undocumented as well as unfixed.

### 2.6 The project's own evidence grade said so

`docs/features/feature_registry.json` graded `e2ee_defaults` as
`"status": "partial"`, `"testCoverage": "doc-only"`, `"evidenceType": "docs"`,
last verified 2026-04-09. The registry was right. Publishing a trust claim whose
internal evidence grade is "doc-only" would have been the weakest link in the
whole page.

---

## 3. Fixed

Decisions confirmed with the operator before implementing: encrypt private rooms
and DMs but not public rooms; leave bot-delivered service rooms plaintext and
disclose them; apply to newly created rooms only, no backfill.

| #   | Finding                      | Fix                                                                                                                 | Commit    |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Synapse default `off`        | `encryption_enabled_by_default_for_room_type: invite` in all three deployable templates                             | `c919ee7` |
| 2.2 | API could not encrypt        | `createRoom` takes a **required** `encrypted` flag; all 13 sites set it explicitly                                  | `c919ee7` |
| 2.3 | Encrypt-after-create race    | Both moved into `initial_state`; failure now fails the create                                                       | `c919ee7` |
| —   | Event den ignored visibility | `routes/coalition.ts:1096` hardcoded `public_chat` even for private events — now tracks visibility                  | `c919ee7` |
| 2.4 | Client defaults              | Modal defaults on; `createDenInCanopy`, `useDiscussionDen`, `applyKit` encrypt; QuickSwitcher reuses `ensureDmRoom` | `a63fbf5` |
| 2.6 | Registry grade               | `e2ee_defaults` → `implemented` / `unit+integration` / `code`                                                       | `3ea57fa` |

### 3.1 Why `encrypted` is required rather than defaulted

A default of `true` would have fixed today's call sites and left the same trap
for tomorrow's. Making the field **required with no default** means the compiler
refuses to build a new call site that has not stated its intent. That converts
the guarantee from a convention into a type error.

### 3.2 What is deliberately still unencrypted, and why

The API bot is a plain `fetch` client with no Olm/Megolm implementation. It
**cannot** send into an encrypted room. Encrypting the rooms it posts into would
not make them private — it would break delivery and show members "unable to
decrypt" forever.

Left plaintext, each with an in-code comment saying so:

-   FBM vendor space and its orders / inventory / ledger rooms, buyer order rooms,
    vendor announcements, customer-message rooms
-   `#bugs` intake (reports are redacted before posting, precisely because this
    room is server-visible)
-   Standing public rooms (`#welcome`, `#governance`, …) and the contributor canopy
-   Publicly joinable dens and kit dens
-   Spaces, which hold hierarchy state and never messages

This list belongs on the trust page verbatim. Disclosing it is the signal;
omitting it would make the rest of the claim worth less. Removing the exception
requires giving the bot real crypto, which is roadmap, not done.

### 3.3 Keeping it true

`tools/ci/check-room-encryption.mjs` (wired as `pnpm guard:room-encryption` and a
CI job) fails the build when a client `createRoom` literal makes no encryption
decision, or when the server-side flag is downgraded to optional.

**The guard's first version was wrong, and the way it was wrong is worth
recording.** It matched the raw call text, so a call site that merely _mentioned_
encryption in a nearby comment passed while creating a plaintext room. A mutation
test caught it: deleting the encryption from `createDenInCanopy` left the guard
green, because the explanatory comment above it contained the word "encryption".
It now strips comments before looking for a decision, and that exact case is
pinned in `tools/ci/check-room-encryption.test.mjs`.

The general lesson: **a guard that has never been observed to fail is not
evidence.** Every check in this audit was mutation-tested.

### 3.4 Tests

-   `packages/api/test/room-encryption.integration.test.ts` — 6 tests asserting
    Megolm lands in `initial_state`, extras are preserved, and each provisioner
    picks correctly by room kind.
-   `tools/ci/check-room-encryption.test.mjs` — 12 tests, including the
    comment-prose regression.
-   `apps/blackout-client/tests/unit/features/canopy/denKind.test.ts` — dens
    encrypted at creation.
-   The FBM bridge tests previously asserted encryption via `sendStateEvent`; they
    now assert it at creation **and** that no post-creation encryption event is
    sent.

Full suites at time of writing: API 1482 passed, client 2794 passed, all repo
guards passing.

---

## 4. Also fixed — adjacent gaps

None of these were live leaks. They were holes in the safety net.

### 4.1 The redactor did not treat message content as sensitive

`packages/core/src/redaction/patterns.ts` had no `body`, `content`, `plaintext`,
or `formatted_body` in any key regex. Nothing logged those keys (§1.3), so the
guarantee rested entirely on nobody ever adding
`log.debug('event', { content })`. Now redacted like secrets at any depth. The
two logs using a `body` key carried upstream Giphy/Tenor error text, not message
content, and moved to `bodyExcerpt`.

### 4.2 Server-side Sentry scrubbing was narrower than advertised

`packages/api/src/telemetry/errors.ts` claimed in its header to use "the same
secret/PII patterns as the structured logger". It kept a hand-copied regex that
had drifted — missing `set-cookie`, `access_token`, `refresh_token` — and applied
it only to top-level breadcrumb keys and `event.request.headers`. An exception
carrying nested context went out unscrubbed. It now runs the shared
`redactObject` over the whole event, matching what the browser client already
did.

### 4.3 `.gitignore` did not cover compose overrides

`.gitignore` covered `.env` and `.env.*` but not `docker-compose.override.yml`,
while the documented workflow is to copy the example into place and fill in
`MATRIX_BOT_TOKEN` and the Postgres password. Rotating the live token is a host
operation this repo cannot perform; stopping the next operator from committing it
is one it can. Verified in both directions: the override is ignored at repo root
and in nested infra directories, and the `.example` remains tracked.

### 4.4 Staging LiveKit credentials failed open

`infra/townhall-staging/docker-compose.yml:21-22` defaulted to
`${LIVEKIT_API_KEY:-LK_DEV_API_KEY}` / `:-LK_DEV_SECRET` — placeholder values
published in this repository. An unset environment started the stack on a known
key pair instead of failing. Now `:?` — the stack refuses to start.

---

## 5. Open — key-backup DecryptionError (BO-1)

**Not fixed. Do not represent it as fixed.**

Not reproducible without the live stack (§Scope limits). More importantly, the
audit could not _size_ it, and the reason is itself the finding:
`apps/blackout-client/src/client/matrixLogger.ts` deliberately drops both the
rust layer's `Failed to decrypt a room event: Can't find the room key` warning
(`:49`) and the `PerSessionKeyBackupDownloader` "no backup" probe (`:32`).

Each suppression is individually defensible — the first is a duplicate of the
js-sdk's own `DecryptionError` line. Together they meant **the rate of users who
cannot read their own history was not observable anywhere in the product.**

The surrounding handling is otherwise complete and well-built:
`hooks/useKeyBackup.ts` covers the full `CryptoEvent` surface,
`BackupRestore.tsx:155` restores, `encryptionPosture.ts:113-127` nudges (with a
comment recording a past regression where the nudge was hidden from exactly the
population that hits this), and `FallbackContent.tsx:50-85` replaces the bare
"Unable to decrypt" with an actionable "Set up backup".

**What changed:** the wrapper now counts what it drops
(`getSuppressedLogCounts()`), so the rate can be read from a diagnostics surface
or attached to a bug report. Filed as **BO-1** in `KNOWN_ISSUES.md`, which
previously listed no defects at all.

**Next step:** collect real `decryptUtd` numbers from the live fleet and
determine whether the cause is backup setup never completing, restore failing, or
cross-signing state. Closing this from the instrumentation alone would repeat the
mistake that made it invisible.

---

## 6. Host runbook — not executable from this environment

### 6.1 Rotate `MATRIX_BOT_TOKEN` and DB credentials

The token is in the live `/opt/blackout-infra/docker-compose.override.yml`, which
is untracked and unreachable from here.
`docs/operations/evidence/2026-05-10-secrets-manager-inventory.md:78` already
assigns it a 90-day rotation.

1. Mint a replacement admin token for the bot account, keeping the old one valid.
2. Move both the token and the DB password into `.env` (already gitignored) and
   replace the literals in `docker-compose.override.yml` with `${MATRIX_BOT_TOKEN}`
   and `${BLACKOUT_DB_PASSWORD}`, matching
   `infra/single-server-baseline/docker-compose.override.yml.example`.
3. `docker compose config` and confirm no literal secret appears in the output.
4. Recreate the `api` and `api-migrate` services; confirm the bot still
   provisions a room and posts to `#bugs`.
5. Invalidate the old token. Rotate the DB password in the same window and
   confirm `api-migrate` completes.
6. Rollback: the previous `.env` values, kept until step 5 is verified.

Because the compose file is now gitignored (§4.3), step 2 will not be undone by
an accidental commit.

### 6.2 Deploying the encryption defaults

**This is a one-way door per room.** Matrix has no un-encrypt: a room that
becomes encrypted stays encrypted. The chosen rollout is new-rooms-only
precisely so that rollback is a code and config revert with no data-shaped
consequences — existing rooms are untouched.

1. Stage first. Create a room from each fixed path and confirm
   `m.room.encryption` is present in initial state.
2. Confirm the bot still posts to `#bugs`, FBM order rooms, and scheduled-message
   targets — these are the rooms deliberately left plaintext, and they are the
   ones a mistake here would break.
3. Deploy the Synapse template change with the app change, not before it.
4. **Rollback caveat, state it explicitly:** reverting restores the old defaults
   for _future_ rooms. Rooms created while the change was live remain encrypted.
   There is no way back for those, and a rollback plan that implies otherwise is
   wrong.

---

## 7. What the trust page may and may not claim

**May claim, verifiable today:**

-   E2EE is never behind a paywall — provable from
    `entitlements/bundles.ts:30-38` containing no encryption key.
-   Every private room and DM is end-to-end encrypted by default, enforced by a
    required compiler-checked flag and a CI guard.
-   No bot or moderation tool can read encrypted room content — the bot has no
    timeline-read call site anywhere.
-   No log or error-tracking path captures message content.
-   A signed warrant canary is live and free at every tier
    (`services/canarySigning.ts`).

**Must disclose alongside it:**

-   The unencrypted-by-design room list from §3.2.
-   That privacy-adjacent features _are_ paid (§1.1).
-   That call and townhall media is **not** covered by message E2EE —
    `THREAT_MODEL.md:76` records it as TLS-only with SFrame planned, residual risk
    R2 at `:149`. Verify the current `CallProvider.tsx` state before writing
    anything about calls.

**Must not claim:**

-   That the key-backup decryption issue is resolved (§5).
-   That the live bot token has been rotated (§6.1).
-   "Privacy is never paywalled."
-   That published Privacy Policy or Terms exist — `docs/legal/` holds drafts
    explicitly marked "NOT YET IN EFFECT" with unfilled placeholders.
