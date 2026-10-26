# API findings — triage, 2026-10-25

A read of the API's routes and services on 2026-10-25, together with the defects
that `docs/black-mask-account-link-design.md` §7 ("Defects found along the way",
D1–D6) listed and left for their own triage. The standing rule applies: every
finding gets a fix or a written explanation, and nothing is baselined.

F1–F4 and D1–D5 were fixed on 2026-10-25. On 2026-10-26 a handler-by-handler
sweep of the API's write routes closed the three routes this record had left
open and two more it found (F5–F9, "Write routes with no session check"; every
handler is listed in the appendix). Everything marked fixed has tests, and the
documents that described the old behaviour are corrected (last section).

| ID  | Finding                                                                                                 | Where                                                                                            | Status                                           |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| F1  | Anyone could publish any key under any user id to the key-transparency log                              | `packages/api/src/routes/keyTransparency.ts`                                                     | fixed                                            |
| F2  | A Matrix id on another homeserver resolved to the local account of the same name                        | `packages/api/src/services/userIdentity.ts`                                                      | fixed                                            |
| F3  | The message endpoint labelled server-readable text `e2e` and stored a copy of the text as a "signature" | `packages/api/src/routes/messages.ts`, `packages/core/src/crypto/index.ts`                       | fixed                                            |
| F4  | The dead-drop appservice logged message bodies and senders                                              | `apps/deaddrop-appservice/src/index.mjs`                                                         | fixed                                            |
| F5  | Anyone could install or revoke any app for any canopy and spend its action quota                        | `packages/api/src/routes/apps.ts`                                                                | fixed                                            |
| F6  | Anyone could link any two communities                                                                   | `packages/api/src/routes/federation.ts`                                                          | fixed; two-admin consent is a product call       |
| F7  | Anyone could register a passkey under another account, or replace a registered one                      | `packages/api/src/routes/webauthn.ts`                                                            | fixed                                            |
| F8  | The admin API key fell back to a value printed in the source                                            | `packages/api/src/middleware/admin-api-key.ts` (new)                                             | fixed; the operator must set the key             |
| F9  | Anyone could mark a Coliseum challenge "seen" for the person challenged                                 | `packages/api/src/routes/coliseum.ts`, `services/coliseumMatchStore.ts`                          | fixed                                            |
| D1  | A refused token refresh was retried instead of signing the client out                                   | `apps/blackout-client/src/client/initMatrix.ts`                                                  | fixed; not reproduced in a browser               |
| D2  | Expired auth rows were never pruned                                                                     | `packages/api/src/services/authRowsPruneScheduler.ts` (new)                                      | fixed                                            |
| D3  | Account-number sign-up bypassed the invite gate                                                         | `packages/api/src/routes/auth.ts`                                                                | fixed                                            |
| D4  | `KNOWN_LIMITATIONS.md` said the panel could not create canopies or dens                                 | `KNOWN_LIMITATIONS.md`                                                                           | fixed                                            |
| D5  | FBM webhooks could be replayed                                                                          | `packages/api/src/integrations/marketplace/freeblackmarket.ts`, `services/marketplaceWebhook.ts` | fixed on Blackout's side; FBM to send the header |
| D6  | FBM's coalition-tier lookup never finds a customer                                                      | the FBM repository                                                                               | not Blackout's; left to FBM's ledger             |

## F1 — the key-transparency log took anyone's word for anyone's key — fixed

**The behaviour.** `POST /v1/key-transparency/append` read `{ userId, masterKey }`
and appended it. It called no `requireUser`, and the auth middleware lets a
request without a token through to the route (`packages/api/src/middleware/auth.ts`),
so an anonymous caller could append. `docs/security/key-transparency.md` said as
much ("Any caller that can hit the API can currently append") under "still left",
and `docs/security/deadman-release-design-2026-10-24.md` observed it when it ruled
the log out as a key store.

**The effect.** The log exists so a client can check that the key the homeserver
shows for its own account is the one it published. Anyone could plant a leaf
`(victim, attacker's key)`; `GET /lookup/:userId` served it, and a client following
the doc's "verify your own most recent leaf" would have verified the attacker's
key. Nobody was affected in practice because no shipped client does the check
(see Open), but the primitive's whole value was gone.

**The fix.** The route requires a session. `userId` is optional and defaults to
the caller's Matrix id; when present it must resolve to the caller's own account,
as a Matrix id or a Blackout id, or the request is refused `403 user_mismatch`.
With F2, the caller's own username on another homeserver is refused too. The
appended `userId` is whatever form the caller used, so a client that publishes
under its Matrix id looks itself up the same way. `POST /verify-sth` now answers
`{ ok, signed }`: `ok` says the STH is well-formed for its scheme (an unsigned
`scheme: 'none'` STH is `ok`), `signed` says a witness signature was present and
verified, so `ok: true` can no longer be read as "a witness vouches for this
root". Lookups and proofs stay public; they are meant to be.

Not borrowed: the API's JWT HMAC secrets (useless to a third-party auditor, and
not to be reused for a second purpose) and the canary signing key
(`BLACKOUT_CANARY_SIGNING_KEY`, one key per purpose). Without
`KT_WITNESS_ED25519_SEED` the STH stays explicitly unsigned.

**Verification.** `packages/api/test/keyTransparency-routes.integration.test.ts`
(anonymous append 401 and appends nothing; another account by Matrix id and by
Blackout id 403; the caller's username on another homeserver 403; own account by
Matrix id, Blackout id and by default 200 with an inclusion proof that verifies;
unsigned STH answers `signed: false`) and
`packages/api/test/keyTransparency-witness.integration.test.ts` (with a seed the
served STH is signed by that key and a tampered root is neither ok nor signed).
The 27 existing service tests are unchanged.

## F2 — a foreign Matrix id resolved to the local account of the same name — fixed

**The behaviour.** `matrixLocalpart` in `packages/api/src/services/userIdentity.ts`
matched `^@([^:\s]+):[^:\s]+$` and returned the localpart of any Matrix id,
ignoring the server name. `resolveBlackoutUserId('@alice:elsewhere.example')`
therefore returned the local `alice`.

**The effect.** Every route that accepts a Matrix id acted on the local account
that shares the name: the profile surface (`modules/profile.ts`: circle map,
palettes; `services/profileStore.ts`), following (`routes/circle.ts`), the
coalition member and user lookups and the steward actions on a named user
(`routes/coalitions.ts`), beneficiary resolution in
`services/coalitionNetworkStore.ts`, and now F1's ownership check. With
federation, `@alice:other.example` is a different person from the local `alice`.

**The fix.** Only a Matrix id whose server name equals this deployment's
(`MATRIX_HOMESERVER_DOMAIN`, compared exactly, port included) names a Blackout
account; anything else resolves to nothing. `parseMatrixId`, `isLocalMatrixId`
and `homeserverDomain()` are exported, and `matrixUserIdFor` and the
account-number route build ids from the same `homeserverDomain()`.

**What this depends on.** `MATRIX_HOMESERVER_DOMAIN` must equal Synapse's
`server_name`. The single-server baseline sets it from `PRIMARY_DOMAIN`
(`infra/single-server-baseline/docker-compose.yml`), which its `.env.example`
sets to `theblackout.app`, the `server_name` in its `homeserver.yaml.template`.
The Railway notes and `packages/api/.env.example` document it. The
`deploy/docker/blackout-backend` stack does not run the API, so it has nothing
to set. The variable was already load-bearing — the Matrix ids the API mints for
room admits were built from it — but where it is unset the fallback
`blackout.local` now also makes a real local Matrix id resolve to nothing on the
profile surface, where before any server name resolved.

**Verification.** `packages/api/test/user-identity.integration.test.ts`: the
server name comes from the env var; `parseMatrixId` keeps a port; a local id
resolves and five foreign spellings (another server, a suffix of it, a port,
different case, trailing space) do not; following a foreign id that shares a
local username is `404 not_found` while the local id follows; a profile-surface
lookup by a foreign id is 404. `follows-mxid.integration.test.ts` asserted the
old behaviour — following `@user:any.domain.example` followed the local
`user` — and now uses a local id and asserts that the same localpart on
another homeserver follows nobody. The other profile and circle suites pass
unchanged.

## F3 — the message endpoint claimed encryption and signatures it did not do — fixed

**The behaviour.** `POST /v1/messages/:channelId` offered `stegoTier` 1–3 and
`sign`. Tier 2 ran `encryptE2E(content, user.pubkeyEd25519)` and stored the row
with `isEncrypted: true, encryptionAlgorithm: 'e2e'`. `encryptE2E`
(`packages/core/src/crypto/index.ts`) was an XOR of the text with the first
sixteen characters of the "key", URL-encoded; the "key" was the account's
`pubkeyEd25519`, which `routes/auth.ts` sets to `crypto.randomUUID()` at
registration — a server-minted random string with no private half anywhere.
`sign: true` stored `signMessage(content, userId)` =
`encodeURIComponent('<userId>:<content>')` as the row's `signature`: a copy of
the text. Tier 3 XOR-ed with the server's `STEGO_KEY` and labelled the row
`steganography`, `isEncrypted: true`.

**The effect.** The API told its client (the Expo scaffold in `packages/mobile`
sends `stegoTier: 2`) that stored, server-readable text was end-to-end
encrypted, and offered a "signature" anyone could forge. `TRUST.md` §1 was
already honest that the endpoint stores text readable on the server; the code
contradicted it, which is the defect `docs/legal/policy-change-process.md`
exists to catch.

**The fix.** Tier 2 stores the text as written. Tier 3 still XOR-s with
`STEGO_KEY` — reversible by the server, which holds the key, and by nobody else;
it is kept only so a stored tier-3 message is not readable at a glance by a
bridged chat viewer, and the code says so. Every row is written with
`isEncrypted: false` and no `encryptionAlgorithm`, and rows written before this
date are reported the same way on read (their stored text is left as it is; the
tier number still says what shape it has). `sign: true` is refused
`400 signing_unavailable` rather than answered with something that is not a
signature; `sign: false`, which older clients send, is still accepted.
`encryptE2E`, `decryptE2E`, `signMessage` and `verifySignature` were removed from
`@blackout/core` and from the client copy
`apps/blackout-client/src/lib/bmc-core/crypto.ts` (nothing imported them; the
helpers' remaining export is `encodeStego`/`decodeStego`, documented as
obfuscation). `docs/blackout-elements-registry.json` no longer lists them.

**Verification.** `packages/api/test/messages-tiers.integration.test.ts`: tier 2
stored as written with no claims and no `e2e` anywhere in the response; tier 3
scrambled with the server key and decodable with it, no claims; tier 1
unchanged; `sign: true` refused and nothing stored, `sign: false` fine; legacy
rows read back without their labels. The existing message-auth and outbound
router suites pass.

Gitleaks' `generic-api-key` rule flagged a comment this fix added to
`routes/messages.ts`: the comment said accounts have no signing key and, after
a colon, named the user record's public-key field, which the rule read as a
key value. The finding's fingerprint is entry 5 in `.gitleaksignore`, and the
comment is reworded so later edits to it do not reintroduce the flag.

## F4 — the dead-drop appservice logged message bodies and senders — fixed

**The behaviour.** The legacy queue's `flushRoom` in
`apps/deaddrop-appservice/src/index.mjs` logged, per queued message,
`{ roomId, sender, body: queued.content?.body, queuedAt }` — the text and who
wrote it — in place of the Matrix send it stands in for.

**The effect.** `TRUST.md` §1: "Nothing logs your messages." The v1
opaque-envelope path the clients use was never affected; the legacy queue was.

**The fix.** The line now carries `{ roomId, anonymized, bodyBytes, queuedAt }`.
The two timers are `unref()`ed so a test can import the module and exit.

**Verification.** `apps/deaddrop-appservice/test/flush-logging.test.mjs`
captures `console.log` across a configure/ingest/flush cycle and asserts the
text, a fragment of it, the sender and the sender's localpart are absent and
the byte length is present; an anonymized room logs neither the sender nor the
bot id. The envelope-parity guard and the appservice's existing tests pass.

## D1 — a refused refresh was treated as a passing failure — fixed

matrix-js-sdk 40.2.0 signs a session out only when the refresh function throws
a `MatrixError` or a `TokenRefreshLogoutError` (`lib/http-api/refresh.js`);
anything else is a transient `Failure` it retries. `buildTokenRefreshFunction`
threw the client's own `MatrixInitError` for every non-2xx, so a device deleted
elsewhere (Synapse answers its refresh 401 `M_UNKNOWN_TOKEN`) or past its end
(403 `M_FORBIDDEN`) was retried instead of signed out.

**The fix.** A 401 or 403 from `/_matrix/client/v3/refresh` throws
`TokenRefreshLogoutError`, with the status and `errcode` in the message; 429 and
5xx keep throwing `MatrixInitError` (`rate_limited`, `invalid_credentials`) and
stay transient. Signing out remains the SDK's job; the refresh function does not
touch the stored session.

**Verification.** `apps/blackout-client/tests/unit/client/initMatrix.tokenRefresh.test.ts`
drives the function the SDK was handed: 401 and 403 (with and without a JSON
body) throw the logout error; 429, 500 and 502 do not; a 200 stores the new
tokens. The panel-session suite, which also exercises the refresh function,
passes. Not reproduced in a browser.

## D2 — expired auth rows were never pruned — fixed

`pruneExpiredRevokedSessions`, `prunePendingOAuthLinks` and (not in the design
doc's list) `prunePendingOidcLogins` existed on the store with no caller. The
revoked-session denylist — one row per revoked access token plus the per-user
"logout everywhere" cutoff — and the pending OAuth and OIDC state only grew;
expiry was checked on read, so correctness was never affected.

**The fix.** `packages/api/src/services/authRowsPruneScheduler.ts` runs all
three hourly (first pass at start), started by `startBackgroundLoops` under the
same leader discipline as the other sweeps; `BLACKOUT_AUTH_ROWS_PRUNE=0` disables
it and `BLACKOUT_AUTH_ROWS_PRUNE_INTERVAL_SECONDS` sets the cadence. The
file-backed store persists after `pruneExpiredRevokedSessions` and
`prunePendingOidcLogins` (it already did after `prunePendingOAuthLinks`), and the
Postgres descriptor table gained `pruneExpiredRevokedSessions` as a resync of
`revokedSessions` (the other two were already listed).

**Verification.** `packages/api/test/auth-rows-prune.integration.test.ts`: one
pass removes exactly the expired row from each table and keeps the live ones (a
live revocation still bites), a second pass removes nothing, the per-user cutoff
is pruned only once its TTL has passed, the scheduler starts idempotently, runs
its first pass at once and stops. `background-loops.integration.test.ts` now
expects it among the default loops. Postgres write-through was not run against
a database.

## D3 — account-number sign-up bypassed the invite gate — fixed

`POST /v1/auth/account-number` minted a Matrix account through the admin API with
no invite check, while `/register` refused without a token under
`REQUIRE_INVITE_TOKEN=1` and `KNOWN_LIMITATIONS.md` said sign-up was
invite-only. The design doc left open whether that was intended; it is not: the
panel offers this path and the invite-only setting is meant to cover every
sign-up.

**The fix.** The route takes an optional `inviteToken` (a request with no body
still parses as `{}`). With `REQUIRE_INVITE_TOKEN=1` and no token it refuses
`403 invite_required`. A presented token is checked before anything is minted
(`400 invite_token_invalid` with the reason — `invalid`, `exhausted`, `expired`,
`revoked` — and no Matrix account), and consumed after, so a room-bound
invitation can admit the new account: `redeemInvitationForMatrixUser` in
`services/invitations.ts` increments the use count atomically exactly as
`redeemInvitation` does and admits the Matrix user to the bound room (the shared
room-admission steps moved into `admitInvitedMatrixUser`), but records no
redemption and follows nobody — there is no Blackout account yet; it is created
lazily on the first token exchange. If the token's last use goes elsewhere
between the check and the mint, the number is withheld (`400`, reason
`exhausted`); the Matrix account then exists with nothing able to sign in to it.

**Verification.** `packages/api/test/account-number-invite-gate.integration.test.ts`:
gate on and no token (`{}` and no body) refuses and mints nothing; unknown,
exhausted, expired and revoked tokens refuse with their reason and mint
nothing; a usable room-bound token mints the derived localpart, consumes one
use, admits `@<localpart>:<server name>` to the room and records no redemption;
with the gate off a presented token is consumed and a missing one allowed; the
race returns 400 without a number; malformed bodies are 400. The existing
account-number and invitation suites pass.

**What a client must do.** The web client's account-number sign-up
(`apps/blackout-client/src/client/accountNumberAuth.ts`) sends `{}`. No tracked
deploy file sets `REQUIRE_INVITE_TOKEN`, so nothing changes by default; with the
gate on, that sign-up is now refused `403 invite_required` until the client
passes the invite token it holds — the gate working as intended, but a client
change is owed before an operator turns it on.

## D4 — `KNOWN_LIMITATIONS.md` was out of date — fixed

The Black Mask panel section listed creating a canopy or a den under "Not there
yet"; the screens shipped 2026-10-24 (`EmbedNew.tsx`, PR #965). The section now
says so.

## D5 — FBM webhooks could be replayed — fixed on Blackout's side

**The behaviour.** `verifyWebhook` was an HMAC-SHA256 over the body alone, so a
captured delivery verified forever. Deduplication on the event id was the only
defence, and it was uneven: the entitlement, bridge, ACL and growth paths
checked `hasProcessedWebhookEvent` themselves, but the tip,
creator-subscription, canopy-plan and boost-pledge captures in
`dispatchMonetizationEvent` did not. A replayed `purchase.succeeded` re-ran
`captureTip` / `captureSubscription` / `applySubscriptionWebhookEvent` /
`captureBoostPledge`: counters and domain events fired again, and
`captureSubscription` set `canceledAt: null` and `status: 'active'`, so a replay
re-activated a subscription cancelled after the first delivery.

**The fix, part one — replay acknowledgement for every family.** After the
signature check, `dispatchMarketplaceWebhook` acknowledges a delivery whose
event id is already marked processed, before any handler runs. The id is taken
from the payload's `eventId` first, because the body is what the signature
covers; `x-fbm-event-id` is outside it, so a captured delivery re-sent under a
fresh header value is still recognised (FBM sends the same value in both, so
the header is checked as well). The answer is `200`,
`alreadyProcessed: true`, `reason: 'already-processed'`, the
`marketplace_webhook_replayed_total` counter and a `marketplace.webhook.replay`
log line. For a lifecycle event the answer carries what the first delivery
granted, as `applyLifecycleEvent` has always returned for a processed event
(a pure lookup).

**The fix, part two — a signature that expires.** `verifyFreeblackmarketWebhookSignature`
accepts `x-fbm-timestamp` (unix seconds): the signature is then over
`<timestamp>.<body>` — the form FBM already uses for its deliveries to Blackstar
— and the timestamp must be within `FREEBLACKMARKET_WEBHOOK_TOLERANCE_SECONDS`
(default 300) of the receiving clock, else `401 timestamp-skew`; a non-numeric
timestamp is `timestamp-invalid`; a body-only signature with the header attached
is `signature-mismatch`. Without the header the body-only form is accepted until
the operator sets `FREEBLACKMARKET_WEBHOOK_REQUIRE_TIMESTAMP=1`
(`timestamp-missing`). The stub provider shares the verifier, so tests and dev
deploys see production's rules.

**Handed to FBM.** Send `x-fbm-timestamp` and sign `<timestamp>.<body>`; the
work order (§1, §7, §8, §9) now says so. Once FBM does, set
`FREEBLACKMARKET_WEBHOOK_REQUIRE_TIMESTAMP=1`. Until then a captured body-only
delivery still verifies, and the event-id acknowledgement is what stops it.

**Verification.** `packages/api/test/fbm-webhook-replay.integration.test.ts`:
the verifier's body-only and timestamped forms, window edges, binding of the
header into the signed material, custom tolerance, missing secret and
signature; at the route, a timestamped delivery accepted and a stale one refused
`timestamp-skew`, a mixed one `signature-mismatch`; a replayed tip capture
acknowledged with the capture counter still 1; a subscription cancelled after
the first delivery stays cancelled across a replay; a replay recognised by the
payload's event id with no header; and a replay under a fresh, attacker-chosen
`x-fbm-event-id` still caught by the signed payload id, its capture counter
still 1. That last test failed on the first version of this fix, which
preferred the header. The marketplace, monetization, growth,
bridge, ACL and smoke suites that drive the webhook pass unchanged.

## D6 — FBM's coalition-tier lookup — not Blackout's

`resolveCustomerIdByMxid` in FBM's `backend/src/lib/blackout-identity.ts` is in
the FBM repository. Nothing here changes; it belongs in FBM's `docs/AUDIT_DEBT.md`
next to F1 there, as the design doc said.

## Write routes with no session check — swept handler by handler, fixed (2026-10-26)

F1 was a write route with no session check. The auth middleware passes a
request without a token through to every route
(`packages/api/src/middleware/auth.ts`), and each route opts in to a check, so
the same gap can recur. On 2026-10-25 a file-level sweep (route files with a
POST, PUT, PATCH or DELETE handler that call no session, admin or capability
check at all) found twelve files, three of them open: `apps.ts`,
`federation.ts` and `webauthn.ts`. It could not see a file that checks the
session in one handler and not in another. This sweep goes handler by handler.

### Method

-   **Every write handler.** Every `post`, `put`, `patch` and `delete`
    registration in `packages/api/src/routes/`, `packages/api/src/modules/` and
    `packages/api/src/index.ts`, found with the TypeScript parser rather than a
    regular expression, so a registration split over several lines counts: 324
    handlers in 75 files. A router exists nowhere else: `new Hono` appears only
    in those directories and `index.ts`, and `index.ts` itself registers only
    `GET /health` and `GET /metrics`. Paths come from the `app.route` mounts in
    `index.ts`, each module's `mountPath`, and `auth.route('/oidc', …)` in
    `auth.ts`. The legacy `/api` alias has been off since 2026-08-31, so each
    handler is reachable only at the paths listed in the appendix.
-   **The check each one makes.** For each handler, the calls in its body and in
    the helpers it calls from the same file, transitively (so `requireModerator`
    in `coalitions.ts` counts as `requireUser` plus `isAdminUser`), the first
    check in the body, and whether its result is acted on (`instanceof Response`,
    `if (denied) return denied`). Every handler with a check acts on it before
    writing anything. Router-level middleware was read by hand: feature-flag
    gates, rate limits, and `requireServiceToken` on `/v1/spatial`, which has no
    write handler.
-   **The ones with none.** Every handler whose body calls no session, admin or
    capability check (42), the 2 that read the session only optionally, and the
    2 whose `requireAdmin` turned out to be the admin API key were read in full.
    17 of the 42 check a secret or a signature instead.
-   **Not covered.** Whether a handler that checks the session also checks
    that the caller may act on the object it names (an owner or role check
    inside the handler) is a different sweep, not done here. Read routes were
    not swept. The WebSocket shims (Twitch IRC, OBS-WS, StreamElements overlay)
    are not HTTP routes; each authenticates with its own token or password.

### Result

| Check                                                          | Before | After |
| -------------------------------------------------------------- | -----: | ----: |
| Session                                                        |    206 |   209 |
| Session and a capability scope                                 |     44 |    44 |
| Session, a capability scope and an operator admin              |      7 |     7 |
| Session and an operator admin (`BLACKOUT_ADMIN_USERS`)         |      8 |     8 |
| Session and a plugin or kit install scope                      |      6 |     6 |
| Session and standing read from the homeserver                  |      6 |     6 |
| Session, a capability scope and canopy admin on the homeserver |      1 |     1 |
| Session and canopy admin on the homeserver                     |      0 |     4 |
| The admin API key header                                       |     12 |    12 |
| A shared secret, an HMAC signature or the appservice token     |      7 |     7 |
| None, by design                                                |     15 |    15 |
| None: writes nothing, or the FBM stub driver only              |      5 |     5 |
| None, and should have had one (F5, F6, F7, F9)                 |      7 |     0 |

The admin API key row is F8: before this change it opened to a value printed in
the source wherever `BLACKOUT_ADMIN_API_KEY` was unset. The appendix lists every
handler under its check.

**Anonymous by design, with the reason and the limit.**

-   Signing in, signing up and recovering an account (9: `auth.ts` register,
    account-number, login, matrix/exchange, token/refresh, password reset
    request and confirm, email verify confirm; `auth-oidc.ts` begin). No
    session exists yet; each carries its own proof (a password, an invitation
    under `REQUIRE_INVITE_TOKEN`, a Matrix access token, a refresh token, an
    emailed token, an allow-listed redirect), and a reset request mails only
    the address's owner and answers the same either way. `authRateLimit`: 10 a
    minute per IP by default, refused rather than allowed when its store is
    down.
-   Signing out (1, `auth.ts` sign-out). Idempotent because the SDK calls it
    with or without a session; it revokes the refresh token it is handed and,
    with a session, that session's token. `authRateLimit`.
-   Passkey sign-in (2, `webauthn.ts` login/begin and login/finish). See F7.
    `authRateLimit`; 503 unless `WEBAUTHN_ENABLED=1`.
-   Bug reports (2, `bugReport.ts`, `widgetReport.ts`). Reporting must work
    signed out. 5 an hour per IP by default (`BUG_REPORT_RATE_LIMIT_MAX`).
-   The issue report (1, `diagnostics.ts`). Writes one redacted log line and
    nothing else. Only the global limit, 120 requests a minute per IP.
-   Writes nothing (3): `keyTransparency.ts` verify and verify-sth compute an
    answer from the body; `coalition.ts` `POST /feed/:id/comments` answers 410.
-   The FBM stub driver (2, `marketplace.ts` `/stub/checkout/:sessionId/complete`
    and `/stub/fbm-event/:kind`). 404 unless `FREEBLACKMARKET_STUB=1`, which the
    env examples and the marketplace guides say never to set in production.
    With it set, anyone can drive signed deliveries through the real webhook
    dispatcher, entitlements included; the API does not refuse to start with
    the stub in production (Open).

**Authenticated another way, and fine.** `boostEvents.ts` and
`splitContracts.ts` check the `X-BMC-Internal-Secret` header against
`BLACKOUT_INTERNAL_SECRET` in constant time and refuse when it is unset;
`matrixAppservice.ts` checks the homeserver's `hs_token` in constant time and
answers 503 when it is unset; `patreonWebhook.ts`, `twitchEventSub.ts` and the
marketplace webhook check HMAC signatures (the marketplace one with D5's
replay rules); the Discord-compatible execute route compares a hash of the URL
token in constant time.

## F5 — anyone could install or revoke any app for any canopy — fixed

**The behaviour.** `POST /v1/apps/directory/:appId/install`, `/revoke` and
`POST /v1/apps/actions/:action` took a `canopyId` and checked no session.
`installApp`'s own policy check asks only that the app and the canopy exist
(`hasCanopy`: the canopy is listed), that the requested scopes are known, and
that a `strict` app is not given `canopy:write`; it never asks who is calling.
Recording an action counts against the installation's quota and error tally.

**The effect.** Anyone, signed in or not, could install a directory app into
any listed canopy with scopes including `roles:write` and `moderation:write`,
revoke one its admins installed, and spend an installation's quota until its
actions were refused `quota_exceeded`. The apps platform records these grants
but runs no app yet, so no app acted on them.

**The fix.** Each route takes a session and the caller's standing as an admin
of the canopy on the homeserver: the standing listing it takes, read by the
same check (`checkMayListCanopy`, exported for this as `checkCanopyAdmin` in
`services/canopyListingGate.ts`). Joined, at the level that changes
`m.room.power_levels`, in a space; `403 not_canopy_admin` for anyone else and
for an unknown room alike; `503` when the homeserver cannot answer;
`401 account_unknown` for a session whose account is gone. The check runs
before the app or canopy is looked up, so a non-admin learns nothing about
whether a canopy is listed. The rule is admin only because an install can grant
`roles:write` and `moderation:write` and only an admin can change a canopy's
power levels, so no lesser role can delegate them; revoking and recording an
action act on the same installation record. A moderator is refused.

**Verification.** `packages/api/test/apps-routes.integration.test.ts`: no
session `401` on all three routes, and the homeserver is not asked; a
moderator, a plain member, a stranger and an admin who left `403` on all three,
each after a state read; the admin installs, runs an action and revokes; an
admin's install cannot be spent or revoked by anyone else; unknown and unlisted
canopies; the fail-closed codes; nothing written on any refusal. All six fail
against the previous routes. The two install tests in
`canopy-directory.integration.test.ts` and the app flow in
`v1-routes.integration.test.ts` posted anonymously; they now post as the
canopy's admin (`v1-routes` stubs the homeserver for that one test).

**Callers.** None outside the API's tests: no route in `apps/blackout-client`,
`packages/blackout-sdk`, `packages/mobile` or `packages/plugins-sdk` calls
them.

## F6 — anyone could link any two communities — fixed; consent across admins is open

**The behaviour.** `POST /v1/federation/links` took no session and stored a
link between any two community ids, of any type (`zone`, `alliance`,
`supply_chain`), for any caller.

**The effect.** `GET /v1/federation/communities` tells anyone which of a set
of ids are linked, so a link is a public statement about both communities, and
anyone could make one about any two. Nothing else reads links yet.

**The fix.** A link needs the consent of both communities, and the only
consent the API can check is standing on the homeserver. The route takes a
session, and the caller must be an admin of each community as a canopy (a
Matrix space), source first, by the same check as F5. A refusal says which side
failed: `403 not_canopy_admin` for a canopy the caller does not run or an id
that is no room, `409 not_a_space`, `503` when the homeserver cannot answer. A
link can therefore be made only by someone who administers both communities.

**Open, a product decision.** Two communities run by different people cannot
be linked: that takes one side proposing and the other accepting, which does
not exist. Whether links should work that way, and whether a link needs a
lesser standing than admin, is for the operator to decide; until then the route
fails closed.

**Verification.** `packages/api/test/federation-links.integration.test.ts`: no
session `401` and no homeserver read; an admin of either side only, a moderator
of both, a stranger and an unknown room `403`; an admin of both links them
after a read of each; a room that is not a space `409`; the fail-closed codes;
nothing linked on any refusal. All five fail against the previous route.

**Callers.** None. The generated contracts client
(`FederationService.linkCommunities`) has no caller. The OpenAPI contract
(`packages/contracts/openapi/v1.yaml`) lists only `201` and `400` for the
route (Open).

## F7 — anyone could register a passkey under another account — fixed

**The behaviour.** `POST /v1/auth/webauthn/register/begin` and
`/register/finish` took any `userId` and no session. The challenge was bound
to that id and the credential stored under it. Separately, `storeCredential`
replaced any record with the same credential id.

**The effect.** Anyone could register their own authenticator under another
account's id. And because a registration with `attestation: 'none'` vouches for
nothing, a crafted response can carry any credential id, and `login/begin`
lists an account's credential ids to anyone, so a caller could also replace
another account's registered credential with their own key. The routes answer
`503` unless `WEBAUTHN_ENABLED=1`, no tracked deploy file sets it, no client
calls them, and `login/finish` mints no session (`docs/contracts/mas-identity.md`
lists them as orphaned), so nothing could be signed in to this way; but no
passkey could be trusted.

**The fix.** Registration takes a session and stores the credential under the
caller's Blackout id. A `userId` in the body is optional and must name the
caller, by Blackout id or local Matrix id, or the request is refused
`403 user_mismatch` (F1's rule). The challenge is issued to the signed-in
account, so another account cannot finish with it. A credential id already
registered, to anyone, is refused `409 credential_exists`. `register/begin`
takes no body or `{}` and answers the WebAuthn user entity with the caller's id
and username.

**Sign-in needs no session.** `login/begin` and `login/finish` run before
there is one, by nature. They now take a Blackout id or a local Matrix id and
look credentials up under the Blackout id, where registration stores them;
`login/finish` still mints no session. All four routes stay behind
`WEBAUTHN_ENABLED` and `authRateLimit`.

**Verification.** `packages/api/test/webauthn-routes.integration.test.ts` drives
the routes with a software authenticator, real `none` attestations and P-256
assertions that `@simplewebauthn/server` verifies: flag off `503` on all four
routes; no session `401`; another account by either id, or the caller's username
on another homeserver, `403`; a challenge issued to another account `400`; the
caller's own registration with no body, `{}`, their Blackout id and their Matrix
id; a registered credential id refused for another account and for its owner,
the record unchanged; sign-in by either id form, another account's passkey
refused, an assertion carrying another challenge's signature
`verification_failed`. Six of the seven fail against the previous routes (the
flag test passes on both). The test process sets `WEBAUTHN_ENABLED` for itself
only, as `webauthn.integration.test.ts` does; the 15 service tests there pass
unchanged.

## F8 — the admin API key fell back to a value printed in the source — fixed

**The behaviour.** Twelve money-path admin writes check the `x-admin-api-key`
header against `BLACKOUT_ADMIN_API_KEY`: ad-revenue periods, allocation, paid
and void (`adRevenue.ts`); tip, creator-subscription and boost-pledge capture
and refund (`tips.ts`, `creatorSubs.ts`, `communityBoosts.ts`); and subscription
comps and refund syncs (`subscriptions.ts`). Each of the five files fell back to
the literal `dev-admin-key` when the variable was unset, and compared with `!==`.

**The effect.** No tracked deploy file sets the variable. Wherever it was
unset, anyone, signed in or not, could send that literal and create and
allocate ad-revenue periods, mark shares paid or void them, capture and refund
tips, creator subscriptions and boost pledges, and comp any account a Canopy
subscription, which unlocks the premium canopy features, voice rooms among
them. The two admin reads behind the same header (another creator's
ad-revenue share, the subscription audit timeline) opened the same way.

**The fix.** One check, `packages/api/src/middleware/admin-api-key.ts`, used by
all five files. With no key configured, or a blank one, every request is
refused `503 admin_api_key_not_configured`; with one, only that value passes
(`403 forbidden` otherwise), compared in constant time over SHA-256 digests so
neither the length nor a prefix leaks. A session never stands in for the key.

**Verification.** `packages/api/test/admin-api-key.integration.test.ts`, over
all twelve writes with a state probe for each: with no key the former default
and any other value are refused and nothing is written; a blank key counts as
none; with a key, no header, a wrong value, the former default and a session are
refused and nothing is written; the configured key is allowed and the write
happens; the two reads. Four of its seven tests fail against the previous gates.
The tips, creator-subscription, monetization phase 2 to 4, growth-attribution
and v1-routes suites, which set the key, pass unchanged.

**What an operator must do.** Set `BLACKOUT_ADMIN_API_KEY` to a long random
value wherever these admin routes are used; until then they answer `503`. And
check whether any deployment ran without it: if so, the admin routes above
accepted the published literal from anyone, and their effects (ad-revenue
periods and payouts, captures and refunds, subscription comps) need reviewing
in that deployment's records.

Shipped ahead of the rest of this sweep, in #984, because of what it opened.

## F9 — anyone could mark a Coliseum challenge "seen" for the person challenged — fixed

**The behaviour.** `POST /v1/coliseum/matches/:id/seen`, the "dodge ping", took
no session and only the match id, which the match listings show to anyone.

**The effect.** The ping sets a targeted challenge's public status to "Seen,
No Response", the dodge badge, which says the person challenged saw it and
said nothing. Anyone, the challenger included, could put that on someone who
never opened the link. Only the global per-IP limit applied.

**The fix.** The route takes a session, and only the challenge's named
opponent can record the ping, the rule `declineMatch` already applies; anyone
else is `403 forbidden`. An open challenge names nobody and shows `open`
whoever sees it, so nobody can mark it. The route shares the per-user match
rate limit with accept and decline. A recipient who opens the link signed out
no longer records anything, so the badge now claims only what the API saw.

**Verification.** `packages/api/test/coliseum-challenge-seen.integration.test.ts`:
no session `401`; the challenger and a bystander `403`; the opponent records it
once; an open challenge refuses everyone; an unknown match `404`; nothing
recorded on any refusal. The three refusal tests fail against the previous
route. The dodge-status test in `coliseum-matches.integration.test.ts` pinged
anonymously; it now pings as the person challenged.

**Callers.** No client calls the route; the web app shows the status only.

## Noticed in the sweep, not changed

-   **Object-level checks were not re-audited.** The sweep records whether each
    handler checks the session, not whether it then checks the object it is
    given. That is the next sweep.
-   **Reads.** `GET /v1/apps/directory` lists every canopy's installations to
    anyone, and `GET /v1/apps/directory/:appId/observability` an installation's
    metrics; `GET /v1/coliseum/matches/:id/link` hands anyone a challenge's
    link token (nothing in the API consumes the token yet).
-   **Passkey sign-in tells anyone whether an account has passkeys.**
    `login/begin` lists the credential ids registered for any id it is given
    and an empty list otherwise, as a username-first passkey flow does. It
    should answer every account alike before passkeys are offered to anyone.
-   **A federation link's bridge room** is whatever room id the caller sends, or
    a made-up `!bridge-…` id when none is sent. Nothing reads it.

## Open

-   **Key transparency.** Rotation is unbounded (bound appends per account per
    day); no shipped client publishes a key or checks a proof; no tracked deploy
    file sets `KT_LOG_FILE` or `KT_WITNESS_ED25519_SEED`.
-   **Tier 3.** An XOR with `STEGO_KEY` (default `local-stego-key` when unset) is
    not a protection and is documented as obfuscation; a candidate for removal
    together with the Expo scaffold's use of the endpoint.
-   **FBM timestamp.** FBM's half of D5, then `FREEBLACKMARKET_WEBHOOK_REQUIRE_TIMESTAMP=1`.
    The stub's own simulated deliveries still use the body-only form.
-   **Invite token from the client.** The account-number sign-up must send
    `inviteToken` before `REQUIRE_INVITE_TOKEN=1` is set (D3).
-   **Linking communities with different admins** (F6). There is no way for one
    side to propose and the other to accept, so only someone who administers
    both can link them. Whether links should work that way is the operator's
    decision.
-   **`BLACKOUT_ADMIN_API_KEY`** (F8). No tracked deploy file sets it, so the
    twelve admin writes behind it answer 503 until an operator does.
-   **The FBM stub in production.** `FREEBLACKMARKET_STUB=1` turns on two
    anonymous routes that drive signed webhooks through the real dispatcher;
    the API should refuse to start with it in production, as it does for the
    placeholder marketplaces.
-   **Passkeys.** No client registers or signs in with one; `login/begin` tells
    anyone whether an account has passkeys; `login/finish` mints no session.
-   **The federation contract.** `packages/contracts/openapi/v1.yaml` lists only
    `201` and `400` for `POST /federation/links`; adding `401`, `403`, `409` and
    `503` means regenerating `packages/contracts/src/generated`.
-   **Object-level checks.** The sweep did not re-audit whether each
    session-checked handler also checks the object it acts on, nor any read
    route (see "Noticed in the sweep").

## Still unverified

-   D1 in a browser: the SDK's reaction to the thrown error is read from
    `lib/http-api/refresh.js`, not observed.
-   D2 in Postgres mode: the descriptors exist; no run against a database.
-   F2 in every deployment: that `MATRIX_HOMESERVER_DOMAIN` is set and equals
    `server_name` wherever the API runs.
-   The appservice's legacy flush still logs in place of a Matrix send.
-   The sweep's completeness rests on the parser finding every registration:
    a route registered some other way (a computed method name, a router built
    outside `routes/`, `modules/` and `index.ts`) would be missed. None was
    found by search, but the search is the evidence.
-   F5 and F6 against a real homeserver: the canopy admin check runs against the
    Synapse admin API stub in `test/_fixtures/matrixStub.ts`, as the listing
    check's own tests do.
-   F7 with a browser's authenticator: the tests use a software authenticator
    with `none` attestation and P-256 keys, not a platform passkey.
-   F8 in any deployment: whether one relied on the old default for its admin
    tooling. Those calls now answer 503 until the key is set.
-   Postgres mode for the federation link and app install writes; the app
    installs are in memory in every mode.

## Documentation corrected with this record

-   `docs/security/key-transparency.md` — status, `/append` and `/verify-sth`
    rows, "still left", tests.
-   `THREAT_MODEL.md` §7 R5.
-   `TRUST.md` §1, the API message endpoint bullet.
-   `KNOWN_LIMITATIONS.md` — the panel section (D4), the marketplace section
    (replay window), a key-transparency section, the invite-only section.
-   `docs/black-mask-account-link-design.md` §7 — a status line per defect.
-   `docs/contracts/freeblackmarket-integration-work-order.md` §1, §7, §8, §9.
-   `docs/legal/CHANGELOG.md` — a 2026-10-25 entry for the two closed §1 gaps
    (F3, F4).
-   `packages/api/.env.example`,
    `infra/single-server-baseline/docker-compose.override.yml.example` — the new
    variables.
-   `docs/blackout-elements-registry.json`, `apps/deaddrop-appservice/README.md`.

With the 2026-10-26 sweep (F5–F9):

-   `KNOWN_LIMITATIONS.md` — a section for the write routes the sweep closed.
-   `THREAT_MODEL.md` — adversary A6 and residual risk R4.
-   `docs/security/webauthn-passkeys.md` — the routes, session binding, credential
    ids registered once, tests.
-   `packages/api/.env.example` — `BLACKOUT_ADMIN_API_KEY`, which has no default.

## Appendix: every write handler, by the check it makes (2026-10-26)

Paths are relative to the mount in parentheses. ‡ marks a handler this change
fixed (F5, F6, F7, F9); † marks one behind the admin API key, which had a
default until this change (F8). A handler's place here is the check at its
door; an owner or role check inside it is not recorded.

-   **Session — 209**
    -   `routes/activedefense.ts` (`/v1/activedefense`): `POST /canary-tokens`, `POST /canary-tokens/trip`, `POST /decoy-data`
    -   `routes/aidPools.ts` (`/v1/aid-pools`): `POST /`, `POST /:id/contribute`, `POST /:id/fulfill`, `POST /:id/close`
    -   `routes/auth-oidc.ts` (`/v1/auth/oidc`): `POST /continue`
    -   `routes/auth.ts` (`/v1/auth`): `POST /email/verify/request`, `POST /logout`, `POST /sessions/revoke`, `POST /password/change`, `POST /account/delete/request`, `POST /account/delete/confirm`
    -   `routes/bounties.ts` (`/v1/bounties`): `POST /`, `POST /:id/claim`, `POST /:id/applications`, `POST /:id/applications/:applicantId/accept`, `PATCH /:id`
    -   `routes/channelPoints.ts` (`/v1/channel-points`): `POST /channels/:channelId/grant`, `POST /channels/:channelId/redeem`, `POST /rewards`, `PATCH /rewards/:rewardId`, `DELETE /rewards/:rewardId`
    -   `routes/circle.ts` (`/v1/circle`): `POST /`, `DELETE /:followeeId`
    -   `routes/coalition.ts` (`/v1/coalition`): `POST /feed`, `POST /feed/:id/likes`, `POST /feed/:id/den`, `POST /mutual-aid`, `POST /tasks`, `PATCH /tasks/:id`, `POST /needs`, `PATCH /needs/:id`, `POST /projects`, `PATCH /projects/:id`, `POST /projects/:id/support`, `POST /notifications/:id/read`, `POST /resources`, `PATCH /resources/:id`, `POST /events`, `PATCH /events/:id`, `POST /events/:id/rsvp`, `POST /events/:id/den`, `POST /events/:id/volunteer-slots`, `POST /events/:id/volunteer-slots/:slotId/signup`, `POST /events/:id/volunteer-slots/:slotId/withdraw`, `POST /events/:id/rides`, `POST /events/:id/rides/:offerId/claim`, `POST /events/:id/rides/:offerId/release`, `POST /rings`, `POST /rings/:id/join`, `POST /rings/:id/leave`, `PATCH /rings/:id/members/:userId`, `POST /rings/:id/relay-out`, `POST /rings/:id/invites`, `POST /rings/:id/invites/accept`, `POST /rings/:id/invites/decline`
    -   `routes/coalitions.ts` (`/v1/coalitions`): `POST /`, `POST /:id/succession`, `POST /:id/succession/second`, `POST /:id/succession/withdraw`, `PATCH /:id`, `POST /:id/archive`, `POST /:id/join`, `POST /:id/leave`, `POST /:id/requests/withdraw`, `POST /:id/requests/:userId/:decision`, `POST /:id/invites`, `PATCH /:id/members/:userId`, `DELETE /:id/members/:userId`, `POST /:id/transfer`, `POST /:id/campaigns`, `POST /:id/campaigns/:campaignId/approve`, `POST /:id/campaigns/:campaignId/payees`, `POST /:id/campaigns/:campaignId/status`, `POST /:id/campaigns/:campaignId/boost`, `POST /:id/campaigns/:campaignId/contribute`, `POST /:id/raise-aid`, `POST /:id/connections`, `DELETE /:id/connections/:platform`, `DELETE /:id/connections/me/:platform`, `POST /:id/connections/me`, `POST /:id/campaigns/:campaignId/sync`, `POST /:id/campaigns/:campaignId/crosspost`, `POST /:id/externals/:activityId/:decision`
    -   `routes/coliseum.ts` (`/v1/coliseum`): `POST /topics`, `POST /topics/:id/den`, `POST /arguments`, `POST /arguments/:id/vote`, `POST /live/sessions`, `POST /live/sessions/:id/speak`, `POST /live/sessions/:id/speak/:userId/grant`, `POST /live/sessions/:id/speak/:userId/revoke`, `POST /live/sessions/:id/pin`, `POST /live/sessions/:id/unpin`, `POST /live/sessions/:id/end`, `POST /challenges`, `PATCH /challenges/:id`, `POST /challenges/:id/entries`, `POST /challenges/entries/:entryId/vote`, `POST /challenges/entries/:entryId/den`, `POST /matches`, `POST /matches/:id/seen` ‡, `POST /matches/:id/accept`, `POST /matches/:id/decline`, `POST /matches/:id/rounds`, `POST /matches/:id/rounds/:idx/vote`, `POST /matches/:id/crucible/open`, `POST /matches/:id/crucible/statement`, `POST /matches/:id/crucible/synthesis`, `POST /matches/:id/verdict`, `POST /knowledge/explainers`, `POST /knowledge/explainers/:id/vote`, `POST /shouts`, `POST /shouts/:id/drops`, `POST /shouts/drops/:dropId/vote`, `POST /shouts/:id/graduate`
    -   `routes/communityAssets.ts` (`/v1/assets`): `POST /`, `POST /:assetId/report`
    -   `routes/communityBoosts.ts` (`/v1/community-boosts`): `POST /pledge`, `POST /pledges/:id/cancel`
    -   `routes/creator.ts` (`/v1/creator`): `POST /listings`, `POST /listings/:id/publish`, `DELETE /listings/:id`, `POST /payouts/onboarding`, `POST /content`, `PATCH /content/:id`, `POST /content/:id/publish`, `POST /content/:id/distribute`
    -   `routes/creatorSubs.ts` (`/v1/creator-subs`): `POST /me/tiers`, `DELETE /me/tiers/:tierId`, `POST /subscribe`, `POST /subscriptions/:id/cancel`
    -   `routes/discordBridgeActivations.ts` (`/v1/integrations/discord/bridges`): `POST /`, `PATCH /:id`, `DELETE /:id`
    -   `routes/discordCompatWebhooks.ts` (`/v1/integrations/discord-compat/webhooks`): `POST /`, `DELETE /:id`
    -   `routes/discordServerImport.ts` (`/v1/integrations/discord/import`): `POST /imports`, `POST /imports/:id/apply`
    -   `routes/gifts.ts` (`/v1/gifts`): `POST /`
    -   `routes/identities.ts` (`/v1/identities`): `POST /`, `POST /:burnerUserId/rotate`, `POST /:burnerUserId/burn`
    -   `routes/invitations.ts` (`/v1/invitations`): `POST /`, `DELETE /:id`, `POST /redeem`
    -   `routes/keyTransparency.ts` (`/v1/key-transparency`): `POST /append`
    -   `routes/kickChatBridges.ts` (`/v1/integrations/kick/chat-bridges`): `POST /`, `DELETE /:id`
    -   `routes/linkedAccounts.ts` (`/v1/linked-accounts`): `POST /:provider/connect`, `POST /:provider/callback`, `DELETE /:provider`
    -   `routes/marketplace.ts` (`/v1/marketplace`): `POST /listings/:providerId/:listingId/reviews`, `POST /listings/:providerId/:listingId/versions`, `POST /checkout`, `PUT /sellers/me/profile`
    -   `routes/media.ts` (`/v1/media`): `POST /perturb`
    -   `routes/mesh.ts` (`/v1/mesh`): `POST /enqueue`, `POST /sync`
    -   `routes/notifications.ts` (`/v1/notifications`): `PUT /rules/:feature/:category`, `DELETE /rules/:feature/:category`
    -   `routes/obsWsPasswords.ts` (`/v1/integrations/obs-ws/passwords`): `POST /`, `DELETE /:id`
    -   `routes/outboundEventWebhooks.ts` (`/v1/integrations/outbound-webhooks`): `POST /`, `DELETE /:id`, `POST /:id/test`
    -   `routes/pluginSocial.ts` (`/v1/plugin-social`): `POST /reviews/:pluginId`, `POST /forks/:pluginId`, `POST /showcases`
    -   `routes/rtmpFanout.ts` (`/v1/integrations/simulcast/fanout`): `POST /:destinationId/start`, `POST /:destinationId/stop`
    -   `routes/scheduledMessages.ts` (`/v1/scheduled-messages`): `DELETE /:id`
    -   `routes/settings.ts` (`/v1/settings`): `PUT /:scope/:category/:key`
    -   `routes/simulcastDestinations.ts` (`/v1/integrations/simulcast/destinations`): `POST /`, `PUT /:id/enabled`, `DELETE /:id`
    -   `routes/streamlabs.ts` (`/v1/integrations/streamlabs`): `POST /sync`
    -   `routes/subscriptions.ts` (`/v1/subscriptions`): `POST /checkout`, `POST /manage-session`, `POST /forward`, `POST /forward/:giftId/claim`, `POST /forward/:giftId/pass`
    -   `routes/telemetry.ts` (`/v1/telemetry`): `POST /events`
    -   `routes/tenor.ts` (`/v1/integrations/tenor`): `POST /share`
    -   `routes/threads.ts` (`/v1/threads`): `POST /activity/:activityId/read`
    -   `routes/tips.ts` (`/v1/tips`): `POST /`
    -   `routes/twitchChatBridges.ts` (`/v1/integrations/twitch/chat-bridges`): `POST /`, `POST /:id/say`, `DELETE /:id`
    -   `routes/twitchIrcBotTokens.ts` (`/v1/integrations/twitch-compat/bot-tokens`): `POST /`, `DELETE /:id`
    -   `routes/vault.ts` (`/v1/vault`): `POST /items`, `PUT /items/:id`, `DELETE /items/:id`
    -   `routes/voice.ts` (`/v1/voice`): `POST /rooms/leave`
    -   `routes/webauthn.ts` (`/v1/auth/webauthn`): `POST /register/begin` ‡, `POST /register/finish` ‡
    -   `routes/widgetAlerts.ts` (`/v1/integrations/widgets/alerts`): `POST /tokens`, `POST /test`, `DELETE /tokens/:id`
    -   `routes/youtubeChatBridges.ts` (`/v1/integrations/youtube/chat-bridges`): `POST /`, `DELETE /:id`, `POST /:id/sync`, `POST /:id/say`
    -   `modules/feed.ts` (`/v1/feed`): `POST /relays`, `DELETE /relays/:relayId`, `POST /relays/:relayId/reinstate`
-   **Session and a capability scope (`requireDomainCapability`) — 44**
    -   `modules/channels.ts` (`/v1/channels`): `POST /`
    -   `modules/deaddrop.ts` (`/v1/deaddrop`): `POST /`, `POST /open`
    -   `modules/deadman.ts` (`/v1/deadman`): `POST /switches`, `POST /switches/:id/check-in`, `POST /switches/:id/cancel`
    -   `modules/forum.ts` (`/v1/forum`): `POST /posts`
    -   `modules/governance.ts` (`/v1/governance`): `POST /proposals`, `POST /votes`, `POST /proposals/:proposalId/resolve`, `PUT /meetings/:meetingId`, `DELETE /meetings/:meetingId`, `POST /treasury/snapshot`, `POST /treasury/milestones`
    -   `modules/growth.ts` (`/v1/growth`): `POST /referrals`, `POST /ambassadors/apply`, `POST /quests/:id/complete`, `POST /migration-credits`, `POST /migration-credits/:id/redeem`
    -   `modules/moderation.ts` (`/v1/moderation`): `POST /actions`
    -   `modules/moderationMjolnir.ts` (`/v1/moderation/mjolnir`): `POST /banlists/:listId/subscribe`, `DELETE /banlists/:listId/subscribe`, `POST /banlists/:listId/rules`, `DELETE /banlists/:listId/rules/:ruleId`, `PUT /protections/:protectionId`
    -   `modules/profile.ts` (`/v1/profile`): `PUT /:userId`, `POST /:userId/wall`
    -   `modules/stego.ts` (`/v1/stego`): `POST /channels`, `POST /channels/:channelId/rotate`, `DELETE /channels/:channelId`
    -   `modules/streaming.ts` (`/v1/streaming`): `POST /creators/:creatorId/stream-key`, `PUT /streams/:streamId/state`, `PUT /streams/:streamId/metadata`, `PUT /streams/:streamId/access`, `POST /extensions`, `PATCH /extensions/:panelId`, `DELETE /extensions/:panelId`, `POST /clips`, `PATCH /clips/:clipId`, `POST /streams/:streamId/sessions/:sessionId/clips`, `DELETE /clips/:clipId`, `POST /streams/:streamId/sessions`, `PATCH /streams/:streamId/sessions/:sessionId`, `PUT /streams/:streamId/moderation`
-   **Session, a capability scope and an operator admin (`BLACKOUT_ADMIN_USERS`) — 7**
    -   `modules/discovery.ts` (`/v1/discovery`): `POST /index/profiles`, `POST /index/activity`, `POST /index/jobs/full`, `POST /index/jobs/incremental`, `POST /analytics/events`
    -   `modules/growth.ts` (`/v1/growth`): `POST /quests`, `POST /quests/:id/end`
-   **Session and an operator admin (`BLACKOUT_ADMIN_USERS`) — 8**
    -   `routes/admin.ts` (`/v1/admin`): `POST /users/:userId/deactivate`, `POST /rooms/:roomId/purge`
    -   `routes/coalitions.ts` (`/v1/coalitions`): `POST /:id/takedown`, `POST /:id/reinstate`, `POST /:id/externals/:activityId/takedown`
    -   `routes/communityAssets.ts` (`/v1/assets`): `POST /:assetId/approve`, `POST /:assetId/reject`, `POST /:assetId/retire`
-   **Session and a plugin or kit install scope (`authorizeScope`) — 6**
    -   `routes/coalition.ts` (`/v1/coalition`): `POST /kits/:id/apply`
    -   `routes/coalitionKitManifests.ts` (`/v1/coalition-kit-manifests`): `POST /:coalitionId/apply`
    -   `routes/pluginInstallations.ts` (`/v1/plugin-installations`): `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/dens`
-   **Session and standing read from the homeserver (voice role, room membership and power) — 6**
    -   `routes/messages.ts` (`/v1/messages`): `POST /:channelId`
    -   `routes/scheduledMessages.ts` (`/v1/scheduled-messages`): `POST /`
    -   `routes/voice.ts` (`/v1/voice`): `POST /rooms/create`, `POST /rooms/join`, `POST /token`, `POST /rooms/moderation/:action`
-   **Session, a capability scope and canopy admin on the homeserver — 1**
    -   `modules/discovery.ts` (`/v1/discovery`): `POST /index/canopies`
-   **Session and canopy admin on the homeserver — 4**
    -   `routes/apps.ts` (`/v1/apps`): `POST /directory/:appId/install` ‡, `POST /directory/:appId/revoke` ‡, `POST /actions/:action` ‡
    -   `routes/federation.ts` (`/v1/federation`): `POST /links` ‡
-   **The admin API key header (`x-admin-api-key`) — 12**
    -   `routes/adRevenue.ts` (`/v1/ad-revenue`): `POST /periods` †, `POST /periods/:id/allocate` †, `POST /shares/:id/mark-paid` †, `POST /shares/:id/void` †
    -   `routes/communityBoosts.ts` (`/v1/community-boosts`): `POST /pledges/:id/capture` †, `POST /pledges/:id/refund` †
    -   `routes/creatorSubs.ts` (`/v1/creator-subs`): `POST /subscriptions/:id/capture` †, `POST /subscriptions/:id/refund` †
    -   `routes/subscriptions.ts` (`/v1/subscriptions`): `POST /admin/comp` †, `POST /admin/refund-sync` †
    -   `routes/tips.ts` (`/v1/tips`): `POST /:id/capture` †, `POST /:id/refund` †
-   **The internal service secret header (`X-BMC-Internal-Secret`), refused when unset — 2**
    -   `routes/boostEvents.ts` (`/v1/boost-events`): `POST /update`
    -   `routes/splitContracts.ts` (`/v1/split-contracts`): `POST /activate`
-   **The webhook's own URL token — 1**
    -   `routes/discordCompatWebhooks.ts` (`/discord-compat/webhooks`): `POST /:id/:token`
-   **HMAC signature — 3**
    -   `routes/marketplace.ts` (`/v1/marketplace`): `POST /webhooks/:providerId`
    -   `routes/patreonWebhook.ts` (`/v1/integrations/patreon/webhook`): `POST /`
    -   `routes/twitchEventSub.ts` (`/v1/integrations/twitch/eventsub`): `POST /`
-   **Appservice token (`hs_token`) — 1**
    -   `routes/matrixAppservice.ts` (`/_matrix/app/v1`): `PUT /transactions/:txnId`
-   **None, by design: signing in, signing up and recovering an account, before any session exists (`authRateLimit`) — 9**
    -   `routes/auth-oidc.ts` (`/v1/auth/oidc`): `POST /begin`
    -   `routes/auth.ts` (`/v1/auth`): `POST /register`, `POST /account-number`, `POST /email/verify/confirm`, `POST /login`, `POST /matrix/exchange`, `POST /token/refresh`, `POST /password/reset/request`, `POST /password/reset/confirm`
-   **None, by design: idempotent sign-out (`authRateLimit`) — 1**
    -   `routes/auth.ts` (`/v1/auth`): `POST /sign-out`
-   **None, by design: passkey sign-in, behind `WEBAUTHN_ENABLED` (`authRateLimit`) — 2**
    -   `routes/webauthn.ts` (`/v1/auth/webauthn`): `POST /login/begin`, `POST /login/finish`
-   **None, by design: anonymous bug reports (5 an hour per IP) — 2**
    -   `routes/bugReport.ts` (`/v1/bug-report`, `/bug-report`): `POST /`
    -   `routes/widgetReport.ts` (`/v1/bug-report/widget`, `/bug-report/widget`): `POST /`
-   **None, by design: an anonymous issue report, written to the log only (the global limit) — 1**
    -   `routes/diagnostics.ts` (`/v1/diagnostics`): `POST /issue-report`
-   **None: writes nothing (pure verification) — 2**
    -   `routes/keyTransparency.ts` (`/v1/key-transparency`): `POST /verify`, `POST /verify-sth`
-   **None: writes nothing (answers 410) — 1**
    -   `routes/coalition.ts` (`/v1/coalition`): `POST /feed/:id/comments`
-   **None: the FBM stub driver, 404 unless `FREEBLACKMARKET_STUB=1` — 2**
    -   `routes/marketplace.ts` (`/v1/marketplace`): `POST /stub/checkout/:sessionId/complete`, `POST /stub/fbm-event/:kind`
