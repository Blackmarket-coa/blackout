# API findings — triage, 2026-10-25

A read of the API's routes and services on 2026-10-25, together with the defects
that `docs/black-mask-account-link-design.md` §7 ("Defects found along the way",
D1–D6) listed and left for their own triage. The standing rule applies: every
finding gets a fix or a written explanation, and nothing is baselined.

Everything marked fixed below is fixed in this change, with tests, and the
documents that described the old behaviour are corrected (last section).

| ID  | Finding                                                                                                 | Where                                                                                            | Status                                           |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| F1  | Anyone could publish any key under any user id to the key-transparency log                              | `packages/api/src/routes/keyTransparency.ts`                                                     | fixed                                            |
| F2  | A Matrix id on another homeserver resolved to the local account of the same name                        | `packages/api/src/services/userIdentity.ts`                                                      | fixed                                            |
| F3  | The message endpoint labelled server-readable text `e2e` and stored a copy of the text as a "signature" | `packages/api/src/routes/messages.ts`, `packages/core/src/crypto/index.ts`                       | fixed                                            |
| F4  | The dead-drop appservice logged message bodies and senders                                              | `apps/deaddrop-appservice/src/index.mjs`                                                         | fixed                                            |
| D1  | A refused token refresh was retried instead of signing the client out                                   | `apps/blackout-client/src/client/initMatrix.ts`                                                  | fixed; not reproduced in a browser               |
| D2  | Expired auth rows were never pruned                                                                     | `packages/api/src/services/authRowsPruneScheduler.ts` (new)                                      | fixed                                            |
| D3  | Account-number sign-up bypassed the invite gate                                                         | `packages/api/src/routes/auth.ts`                                                                | fixed                                            |
| D4  | `KNOWN_LIMITATIONS.md` said the panel could not create canopies or dens                                 | `KNOWN_LIMITATIONS.md`                                                                           | fixed                                            |
| D5  | FBM webhooks could be replayed                                                                          | `packages/api/src/integrations/marketplace/freeblackmarket.ts`, `services/marketplaceWebhook.ts` | fixed on Blackout's side; FBM to send the header |
| D6  | FBM's coalition-tier lookup never finds a customer                                                      | the FBM repository                                                                               | not Blackout's; left to FBM's ledger             |
| F8  | The admin API key fell back to a value printed in the source                                            | `packages/api/src/middleware/admin-api-key.ts` (new)                                             | fixed; the operator must set the key             |

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

## F8 — the admin API key fell back to a value printed in the source — fixed

Found on 2026-10-26 by the handler-level sweep of write routes that follows
this record's "Found while fixing" section, and shipped ahead of the rest of
that sweep because of what it opened.

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

## Found while fixing: other write routes with no session check — open

F1 was a write route with no session check. The auth middleware passes a
request without a token through to every route
(`packages/api/src/middleware/auth.ts`), and each route opts in to a check, so
the same gap can recur. A file-level sweep — route files under
`packages/api/src/routes/` and `packages/api/src/modules/` that have a POST,
PUT, PATCH or DELETE handler and call no session, admin or capability check at
all — found twelve. It is a lower bound: a file that checks the session in one
handler and not another is not caught.

Open, not fixed here (each needs its own triage):

-   **`routes/apps.ts`** — `POST /v1/apps/directory/:appId/install`,
    `/directory/:appId/revoke` and `/actions/:action` take a `canopyId` and
    check no session; any caller, signed in or not, reaches `installApp` /
    `revokeApp` for any canopy. What `installApp`'s own policy check enforces
    was not read.
-   **`routes/federation.ts`** — `POST /v1/federation/links` creates a
    federation link between any two community ids for any caller.
-   **`routes/webauthn.ts`** — `register/begin` and `register/finish` take any
    `userId` with no session, so a caller can register their own authenticator
    under another account's id. `login/finish` only verifies an assertion and
    mints no session, nothing in `apps/blackout-client` calls these routes, and
    they answer 503 unless `WEBAUTHN_ENABLED=1`. Not exploitable for sign-in
    today; it must be bound to the session before anything trusts a passkey
    assertion.

Checked and fine — authenticated another way: `boostEvents.ts` and
`splitContracts.ts` (internal shared secret `X-BMC-Internal-Secret`, constant
time), `matrixAppservice.ts` (`hs_token`), `patreonWebhook.ts` and
`twitchEventSub.ts` (HMAC signatures), `modules/channels.ts`
(`requireDomainCapability`). Anonymous by design and rate-limited:
`bugReport.ts`, `widgetReport.ts` (5 an hour per IP by default) and
`diagnostics.ts` (an anonymous issue report, redacted and logged).

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
-   **Write routes with no session check.** `apps.ts`, `federation.ts`,
    `webauthn.ts`; see above.

## Still unverified

-   D1 in a browser: the SDK's reaction to the thrown error is read from
    `lib/http-api/refresh.js`, not observed.
-   D2 in Postgres mode: the descriptors exist; no run against a database.
-   F2 in every deployment: that `MATRIX_HOMESERVER_DOMAIN` is set and equals
    `server_name` wherever the API runs.
-   The appservice's legacy flush still logs in place of a Matrix send.

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
