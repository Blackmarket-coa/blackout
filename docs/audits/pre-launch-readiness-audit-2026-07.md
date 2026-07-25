# Blackout — Pre-Launch (Post-Beta → GA) Readiness Audit

|                    |                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit date**     | 2026-07-25                                                                                                                                                                                                                                                                                                                                                          |
| **Commit audited** | `1775a93` (branch `develop`; audit branch `claude/pre-launch-app-audit-mp0yvg`)                                                                                                                                                                                                                                                                                     |
| **Product stage**  | V1 "Test Flight" (invite-gated beta) → targeting General Availability                                                                                                                                                                                                                                                                                               |
| **Scope**          | First-party code and operations: `packages/api` (Hono backend), `apps/blackout-client` (React/Vite frontend), `packages/*` shared libraries, CI/CD, deployment, security tooling, legal/compliance. Vendored upstreams (Synapse fork under `apps/blackout-server`, Cinny/Element fork in the client) reviewed for integration and licensing only, not line-by-line. |
| **Method**         | Automated build/lint/test/dependency baseline; 13-dimension source audit with adversarial verification; direct first-hand verification of every Critical and High finding by the lead auditor.                                                                                                                                                                      |

> **Verification status.** Every **Critical** and **High** finding below was re-read and confirmed first-hand against source at the cited `file:line`. Medium/Low findings are marked either **[confirmed]** (independently re-read) or **[reported]** (single-pass source review with quoted evidence; independent re-verification recommended before remediation sign-off). The adversarial verification pass for a subset of Medium findings was interrupted by an infrastructure rate limit and is noted where it applies.

---

## 1. Executive summary

Blackout is a large, ambitious, and — at its core — **well-engineered** platform. The build is green, the unit suite is substantial and passing (2,057 client tests + the API `node:test` suite), the cryptographic primitives are careful, money math uses integer cents, and the CI guard framework is unusually thorough. This is not a codebase in trouble.

It is, however, **not yet ready for General Availability**, for five concrete reasons that are independent of code quality:

1. **Headline OPSEC features do not work as advertised.** The marketed _dead-man's switch_ has no autonomous server-side trigger — it only fires when the still-authenticated owner personally calls an endpoint, i.e. never in the scenario it exists for. The _canary tripwire_ and _mesh relay_ persist only in process memory and are wiped on every restart/redeploy. For a product sold on OPSEC guarantees, these are correctness **and** trust/false-advertising risks.
2. **No Privacy Policy or Terms of Service exist** in the repository, while the product processes private messages, payments (Stripe/Patreon/Lago), and email, and the client already renders a Terms acceptance screen. This is a hard legal blocker for GA.
3. **Reliability posture is single-instance-only.** Graceful shutdown, background-job ownership, the rate limiter, and the default persistence mode all behave correctly for one process but degrade or lose data the moment the service is scaled, rolled, or hit by a Redis blip — exactly what GA traffic and zero-downtime deploys require.
4. **The security CI lane cannot fail a build,** several security tools are silently inert (SOPS, SonarQube), and there are 4 unresolved high-severity dependency advisories in the production tree. The dashboards are green because they gate nothing.
5. **Deployment surfaces have rotted.** At least two "production" entry points (`index.js` / Railway, root `Dockerfile.blackout`) reference paths that no longer exist and will fail or silently serve 404s, while the _working_ stack sits elsewhere — a launch-day operator footgun.

None of these require a rewrite. The gaps are concentrated at the edges (packaging, tooling wiring, feature completion, legal, ops config), and the core is close. **Estimated effort to a defensible GO is measured in weeks, not months.**

### Go / No-Go recommendation

> **NO-GO for General Availability at commit `1775a93`.** Proceed to GA only after the **P0** items in §8 are fixed and re-verified. The beta ("Test Flight") may continue as-is on a single instance provided the OPSEC feature limitations are disclosed to testers. There is a clear, short path to GO.

---

## 2. Launch-readiness scorecard

| Area                               |  Status  | One-line rationale                                                                                                     |
| ---------------------------------- | :------: | ---------------------------------------------------------------------------------------------------------------------- |
| Build / typecheck / unit tests     | 🟢 Green | `pnpm build`, `lint:runtime`, `test:runtime` all pass locally at this commit.                                          |
| Core authentication & crypto       | 🟢 Green | Careful hand-rolled auth: constant-time HMAC, scrypt, secret-strength gate, rollover, AES-256-GCM with row-scoped AAD. |
| Authorization (BOLA/IDOR)          | 🟡 Amber | Consistent ownership checks across most routes; 3 coalition PATCH handlers miss them.                                  |
| OPSEC feature correctness          |  🔴 Red  | Dead-man's switch never fires autonomously; canary/mesh state is in-memory only.                                       |
| Reliability at scale               |  🔴 Red  | Shutdown, loop-doubling, rate-limit fail-open, file-mode default, write-behind loss.                                   |
| Data persistence & migrations      | 🟡 Amber | Strong migration tooling; default `file` mode + write-behind data-loss window are risks.                               |
| Payments / money handling          | 🟢 Green | Timing-safe webhook signatures, integer-cent + bps math, marketplace idempotency store.                                |
| Input validation / edge exposure   | 🟡 Amber | Good webhook signature discipline; no body-size limit; 3 WS shims outside middleware.                                  |
| Dependency & supply-chain security |  🔴 Red  | 4 high-sev advisories in prod tree; security CI lane is non-blocking.                                                  |
| Security/quality tooling integrity |  🔴 Red  | SOPS + SonarQube inert; several guards unwired; 9 workflows over-scoped.                                               |
| Observability & error handling     | 🟡 Amber | Good logging/metrics/tracing hooks; `/health` over-shares; no `app.onError`.                                           |
| Deployment & release engineering   |  🔴 Red  | Broken/stale deploy entry points; competing production stacks.                                                         |
| Legal & compliance                 |  🔴 Red  | No Privacy Policy / ToS; AGPL source-offer affordance unverified.                                                      |
| Documentation & defect intake      | 🟡 Amber | Rich runbook corpus; readiness docs stale & self-certified; defect loop not running.                                   |

---

## 3. Findings by severity

Counts: **1 Critical · 11 High · 15 Medium · 9 Low** (plus documented strengths in §6).

### 3.1 Critical

#### C1 — Dead-man's switch never fires autonomously _(safety / correctness / false-advertising)_ **[confirmed]**

-   **Location:** `packages/api/src/modules/deadman.ts:269-322`; absence in `packages/api/src/backgroundLoops.ts`; client `apps/blackout-client/src/app/features/deadman/useDeadmanSwitch.ts`.
-   **What it is:** The only code path that transitions a switch to `grace`/`triggered` is `POST /deadman/process-overdue`, which requires an authenticated caller and scopes the sweep to `record.ownerId === subject` (switches owned by the caller). There is **no server-side timer** anywhere — `backgroundLoops.ts` contains health, ingest, poller, scheduled-message, and FBM sweepers, but nothing for deadman.
-   **Impact:** A dead-man's switch exists precisely to fire when the owner is incapacitated, arrested, or gone. This implementation can only fire when the owner is present and authenticated enough to call the endpoint — i.e. it never triggers in its own threat scenario. For a platform marketing this as an OPSEC guarantee, that is a correctness failure and a user-safety/trust liability.
-   **Recommendation:** Add an autonomous, leader-elected background sweep (server-time based) that evaluates all overdue switches independent of owner presence; or, until then, remove the feature from the product surface and marketing and disclose it to testers.

### 3.2 High

#### H1 — WebSocket shims sit outside all middleware; Twitch-IRC shim enables unauthenticated DoS **[confirmed]**

-   **Location:** `packages/api/src/index.ts:423-458` (shims attached to the raw HTTP server _after_ `serve()`); `packages/api/src/integrations/twitch-compat/ircServer.ts:204` (`new WebSocketServer({ noServer: true })`, no `maxPayload`, no auth/idle timeout); `obs-ws-compat/server.ts`, `se-overlay-compat/server.ts`.
-   **Impact:** `/twitch-irc`, `/obs-ws/<id>`, and `/se-overlay/` bypass the entire Hono chain — no global rate limiting, no security headers, no origin enforcement. The Twitch shim additionally has no unauthenticated-connection timeout and accepts the `ws` default 100 MiB per frame, which are stringified/parsed pre-auth. An anonymous attacker can hold unbounded connections and stream large frames → memory/CPU exhaustion on an internet-facing port.
-   **Recommendation:** Add an unauthenticated-connection idle timeout (as OBS/SE already have), set `maxPayload` to a small bound, rate-limit the upgrade path per IP, enforce an `Origin` allowlist, and cap concurrent sessions per credential.

#### H2 — Graceful shutdown registered only in postgres mode; HTTP server never closed **[confirmed]**

-   **Location:** `packages/api/src/index.ts:324-347`.
-   **Impact:** `SIGTERM`/`SIGINT` drain handlers are inside `if (shouldListen && RUNTIME_DB_MODE === 'postgres')`. In the **default** `file` mode (and `memory` mode) there is no signal handler at all, and even in postgres mode `httpServer` is never `close()`d and in-flight requests are not drained before `process.exit(0)`. Rolling deploys drop live requests and can truncate the write-behind queue (see H3).
-   **Recommendation:** Register shutdown handlers unconditionally; `httpServer.close()` and await in-flight completion (with a timeout) before draining the store and exiting.

#### H3 — Write-behind queue can lose committed writes (including financial) on non-graceful exit **[confirmed]**

-   **Location:** `packages/api/src/db/writeBehindQueue.ts:1-8,83-107`; `packages/api/src/db/store.ts` (postgres mode).
-   **Impact:** In postgres mode the store's mutators return synchronously after updating the in-memory mirror; Postgres writes are applied asynchronously, "retried once but never thrown," with durability "bounded by `drain()` on graceful shutdown." A crash (OOM, `SIGKILL`, panic) — or any exit path without the drain handler (see H2) — loses all un-flushed writes silently, and individual write failures are only logged. This can drop financial and security-state writes.
-   **Recommendation:** Make critical writes (payments, entitlements, security state) synchronous/transactional rather than write-behind, surface queue-failure metrics with alerting, and ensure drain runs on every exit path.

#### H4 — Background job loops have a fail-open replica gate and no leader election **[confirmed]**

-   **Location:** `packages/api/src/index.ts:419-421`; `packages/api/src/backgroundLoops.ts`.
-   **Impact:** Loops run unless `BLACKOUT_BACKGROUND_WORKERS_DISABLED === '1'` is set. Scaling past one app replica without that env var causes every replica to run the pollers, dispatchers, and sweepers → duplicate message dispatch, duplicate outbound webhooks, duplicate side-effects. The safe state depends on an operator remembering a negative env var.
-   **Recommendation:** Use a database advisory lock / leader election so exactly one process runs each loop regardless of configuration; make the default safe.

#### H5 — Rate limiter fails open on any store error **[confirmed]**

-   **Location:** `packages/api/src/middleware/rate-limit.ts:147-155`.
-   **Impact:** On any Redis/store error the limiter logs a warning and calls `next()` — brute-force and abuse protection (including the auth bucket) silently disables fleet-wide during a Redis incident. Combined with the in-memory fallback when `REDIS_URL` is unset, a misconfigured or degraded deploy has no effective rate limiting while appearing healthy.
-   **Recommendation:** Fail closed (or degrade to a strict local limiter) on the auth/sensitive buckets; alert on store errors; require `REDIS_URL` in production.

#### H6 — Default persistence mode is `file`: production can silently run on a single JSON file **[confirmed]**

-   **Location:** `packages/api/src/db/store.ts:148` (`const DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'file'`); `packages/api/.env.example`.
-   **Impact:** A production deploy that omits `BLACKOUT_DB_MODE=postgres` runs on a non-atomic on-disk JSON store — no concurrency guarantees, no multi-replica support, and data loss on container replacement. The default is the unsafe option.
-   **Recommendation:** Default to `postgres` (or refuse to boot in `NODE_ENV=production` without an explicit durable mode), matching the pattern already used for CORS and JWT secrets.

#### H7 — The security CI lane cannot fail a build **[confirmed]**

-   **Location:** `.github/workflows/security.yml:48-51` (`pnpm audit ... || echo ::warning`), `:124` (Trivy `exit-code: "0"`), `:97-107` (gitleaks scans only the commit range).
-   **Impact:** Dependency audit, container/filesystem scan, and secret scan all report but never block. The security dashboard is green regardless of what it finds, producing a false sense of assurance for the go/no-go decision.
-   **Recommendation:** Make `pnpm audit` (high+) and Trivy blocking on `main`/release; run `gitleaks detect` over full history at least once before GA.

#### H8 — Four high-severity dependency advisories in the production tree **[confirmed]**

-   **Evidence:** `pnpm audit --prod` and the OSV scanner report:
    -   `postcss` ≤ 8.5.17 — path traversal (GHSA-r28c-9q8g-f849), fixed 8.5.18 (2 paths).
    -   `react-router` 7.18.0 — RSC-mode CSRF bypass (GHSA-qwww-vcr4-c8h2), fixed 8.3.0.
    -   `brace-expansion` — ReDoS/OOM (GHSA-mh99-v99m-4gvg) via React-Native transitive deps.
    -   `tar` 7.5.19 — (GHSA-r292-9mhp-454m, medium), fixed 7.5.21.
-   **Impact:** The `audit-clean` / OSV CI job is red on `develop`. `react-router` in particular is a direct client dependency with a security fix behind a major version.
-   **Recommendation:** Upgrade `postcss` and `tar` (patch bumps); plan the `react-router` 8 upgrade or apply the documented mitigation; add `pnpm.overrides` for the transitive `brace-expansion`.

#### H9 — Access-token revocation is incomplete: revoked sessions stay valid up to 24h **[reported]**

-   **Location:** `packages/api/src/routes/auth.ts:487-493,531-537`; `packages/api/src/services/refreshToken.ts:83-84`; `packages/api/src/db/store.ts:906-916`.
-   **Impact:** "Revoke all sessions" and refresh-token reuse detection burn refresh families but do not invalidate already-minted access JWTs, which remain valid until their TTL (up to 24h). After a device compromise or reuse event, the attacker's access token keeps working.
-   **Recommendation:** Track a per-user/session revocation epoch checked in `authMiddleware` (the `jti`/session-revocation store already exists), or shorten access-token TTL materially and lean on refresh rotation.

#### H10 — Deployment surface rot: broken and competing production entry points **[confirmed]**

-   **Location:** `index.js:8` (serves `apps/blackout-web/dist`, which no longer exists — moved to `legacy/blackout-web`; canonical is `apps/blackout-client/dist`); `railway.json` (`startCommand: pnpm start` → the broken `index.js`); `Dockerfile.blackout:14` (`COPY blackout/ ./blackout/` — no such directory); competing stacks in `deploy/docker/production/` vs `infra/single-server-baseline/` (divergent image orgs `ghcr.io/blackmarket-coa/*` vs `ghcr.io/blackout/*`, different Synapse strategies).
-   **Impact:** The Railway path serves 404 for every route while `/health` returns 200 (looks healthy, serves nothing). The root Docker build fails outright. An operator following the wrong README ships a broken surface. _(The authoritative path — `deploy/docker/production` + the `blackmarket-coa/blackout` image built from `apps/blackout-server/Dockerfile`, which correctly builds `@blackout/api` — is sound.)_
-   **Recommendation:** Delete or fix the dead entry points (`index.js`, root `Dockerfile.blackout`, the stale nginx image in `deploy/docker/Dockerfile`), and designate one canonical, documented production stack.

#### H11 — No Privacy Policy or Terms of Service _(legal)_ **[confirmed]**

-   **Location:** repository-wide (only vendored Synapse templates exist); the client renders `apps/blackout-client/src/app/components/uia-stages/TermsStage.tsx`.
-   **Impact:** The platform processes private messages, payment data, and email, and presents a Terms acceptance step, but there is no first-party ToS or Privacy Policy to accept. This is a legal launch blocker in essentially every jurisdiction (GDPR/CCPA transparency obligations, payment-processor requirements) and undermines the acceptance UI.
-   **Recommendation:** Publish a first-party Privacy Policy and ToS (covering data classes, retention, sub-processors, deletion rights), wire `TermsStage` to them, and confirm the AGPL §13 network-source-offer affordance is present in the running app.

### 3.3 Medium

| #   | Finding                                                                                                                                                                                                  | Location                                                                                  | Status    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| M1  | **BOLA:** any authenticated user can update any coalition _need_ (no ownership/membership check; sibling handlers do enforce it).                                                                        | `packages/api/src/routes/coalition.ts:514-524`                                            | reported  |
| M2  | **BOLA:** any authenticated user can change any coalition _resource_ availability.                                                                                                                       | `coalition.ts:760-770`                                                                    | reported  |
| M3  | **BOLA:** any authenticated user can change any coalition _task_ status.                                                                                                                                 | `coalition.ts:467-477`                                                                    | reported  |
| M4  | `POST /auth/matrix/exchange` auto-provisions and mints a full session from a Matrix token; conditional account-takeover if the homeserver's registration is not Blackout-exclusive.                      | `routes/auth.ts:427-469`                                                                  | reported  |
| M5  | **No request body-size limit**; unauthenticated webhook receivers buffer the full body into memory before the signature check → memory-exhaustion DoS.                                                   | `routes/twitchEventSub.ts`, `routes/patreonWebhook.ts`, `index.ts`                        | reported  |
| M6  | **No central env-schema validation:** ~234 `process.env` reads across ~99 files (202 distinct names), mostly silent defaults → misconfiguration produces quiet misbehavior.                              | `packages/api/src`                                                                        | confirmed |
| M7  | **No `app.onError()` / `app.notFound()`:** unhandled route exceptions bypass the API's error contract and reporter, hitting Hono's default 500 (stack/info leak risk).                                   | `packages/api/src/index.ts`                                                               | confirmed |
| M8  | Widget-alert bearer secret passed in `?token=` query string on the SSE stream (leaks to logs/Referer); no per-token concurrency cap.                                                                     | `routes/widgetAlerts.ts:220-230`                                                          | reported  |
| M9  | `/health` (unauthenticated) discloses `jwtSecretsConfigured` count, `tokenTransport`, and the Matrix `botUserId` + failure detail.                                                                       | `packages/api/src/index.ts` (health handler)                                              | reported  |
| M10 | `LOG_HASH_SALT` defaults to a hardcoded literal with no production enforcement → pseudonymized user IDs in logs are rainbow-tableable.                                                                   | `packages/api/src/telemetry/logger.ts:19`                                                 | confirmed |
| M11 | Postgres store is "single-instance write-through" with a real cross-replica stale-read window; deploy manifests scale replicas while docs contradict each other.                                         | `store.ts:6302-6307`, `deploy/kubernetes/…`, `deploy/helm/…`                              | reported  |
| M12 | Migration checksums are recorded but never verified → an edited applied migration causes silent schema drift.                                                                                            | `packages/api/src/db/migrate.ts:62-73,150-164`                                            | reported  |
| M13 | `sonar-project.properties` still targets `element-web`/`element-hq` with non-existent source paths → SonarQube scans nothing.                                                                            | `sonar-project.properties`                                                                | confirmed |
| M14 | SOPS/age secrets encryption is non-functional — every recipient is a literal `age1placeholder…`; the key ceremony was never run.                                                                         | `.sops.yaml:29-32,38-41`                                                                  | confirmed |
| M15 | Nine workflows (incl. `deploy-compose-prod`, `production-ops-evidence`) run with the default broad `GITHUB_TOKEN` scope (no `permissions:` block).                                                       | `.github/workflows/*`                                                                     | confirmed |
| M16 | Canary tripwire / active-defense state is in-memory only (self-described "stub service") — lost on restart; not multi-replica safe.                                                                      | `packages/api/src/services/activeDefense.ts`                                              | confirmed |
| M17 | Mesh-relay store-and-forward is an in-memory array (`MAX_STORE=10_000`) — data loss on restart.                                                                                                          | `packages/api/src/services/meshRelay.ts`                                                  | reported  |
| M18 | Dead-drop envelope validator is hand-duplicated between protocol and appservice; the "parity" test does not actually compare the two implementations, so they can silently diverge (metadata-leak risk). | `apps/deaddrop-appservice/src/envelope.mjs`, `packages/blackout-protocol/.../envelope.ts` | reported  |
| M19 | Plugin/monetization sandbox RPC surface is entirely stubbed to "not-implemented," while wired end-to-end in the UI.                                                                                      | `apps/blackout-client/src/app/features/monetization/install/sandbox/defaultHandlers.ts`   | reported  |
| M20 | Defect-intake loop not running: `KNOWN_ISSUES.md` is empty ("_none yet_") mid-test-flight and `docs/launch/builds/` (referenced by the process) does not exist.                                          | `KNOWN_ISSUES.md`, `docs/launch/`                                                         | confirmed |
| M21 | `guard:auth-secrets` and GitGuardian (`.gitguardian.yaml`) are configured but invoked by no workflow; pre-commit runs Prettier only (no secret scan/lint/typecheck).                                     | `tools/ci/check-auth-secrets.mjs`, `.husky/pre-commit`                                    | confirmed |

### 3.4 Low / hygiene

| #   | Finding                                                                                                                                                                                                                                           | Location                                             | Status    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| L1  | JWT `alg` header not validated before verify — **not exploitable** (verification is hardcoded to HS256 with the server secret), but a defense-in-depth gap should a refactor ever select the algorithm from the header.                           | `services/auth.ts:228-257`                           | confirmed |
| L2  | Refresh-token rotation is check-then-replace, not atomic — a concurrent double-submit could mint two valid families under the postgres store.                                                                                                     | `services/refreshToken.ts:53-73`                     | reported  |
| L3  | Matrix appservice bearer token compared with non-constant-time `!==` (deviates from the `timingSafeEqual` used elsewhere) and accepted from the query string.                                                                                     | `routes/matrixAppservice.ts:108`                     | reported  |
| L4  | GIF binary proxies follow redirects, so the `*.tenor.com`/`*.giphy.com` allowlist can be bypassed via an open redirect on the CDN (conditional SSRF; requires auth).                                                                              | `routes/tenor.ts:174-179`, `routes/giphy.ts:158-163` | reported  |
| L5  | Down-migration round-trip test asserts only table **count**, not schema fidelity (columns/indexes/constraints), so a lossy rollback passes CI.                                                                                                    | `tools/ci/verify-migrations-ephemeral.mjs:62-85`     | reported  |
| L6  | `guard:feature-budget` measures UI-test coverage against the **archived** `legacy/blackout-web` package and is not wired into CI.                                                                                                                 | `tools/ci/check-feature-ui-test-coverage.mjs:7`      | confirmed |
| L7  | `qa-monorepo` and `nav-audit` CI jobs are soft (`continue-on-error`) pending repo variables that are not set; `nav-audit` further degrades to a bootstrap-gate skip without a homeserver.                                                         | `.github/workflows/ci.yml`                           | reported  |
| L8  | Nightly k6 load test cannot produce signal: the API never boots in the workflow and the wait-loop has no fail-fast, so k6 hits a dead port (2M failed requests) and the real boot error is never captured. **No production latency data exists.** | `.github/workflows/load.yml:65-82`                   | confirmed |
| L9  | ~47 `console.*` calls remain in shipped client `src` (minor log noise / potential info leak).                                                                                                                                                     | `apps/blackout-client/src`                           | confirmed |

---

## 4. Verified baseline (this commit, this environment)

| Check                                | Command                          | Result                                                                |
| ------------------------------------ | -------------------------------- | --------------------------------------------------------------------- |
| Install                              | `pnpm install --frozen-lockfile` | ✅ ok                                                                 |
| Build                                | `pnpm build` (turbo)             | ✅ exit 0                                                             |
| Lint (runtime)                       | `pnpm lint:runtime`              | ✅ exit 0                                                             |
| Unit tests (runtime)                 | `pnpm test:runtime`              | ✅ client 348 files / 2,057 passed, 3 skipped; API `node:test` passed |
| Dependency audit (prod)              | `pnpm audit --prod`              | ❌ 4 high (see H8)                                                    |
| DR backup verification (CI, nightly) | `dr-backup-verification.yml`     | ✅ passing on `develop`                                               |
| Load test (CI, nightly)              | `load.yml` (k6)                  | ❌ failing — API never boots (see L8), no perf signal                 |
| Security lane (CI)                   | `security.yml`                   | ⚠️ reports only; cannot fail build (see H7)                           |

Client test output includes benign `jsdom` noise (`HTMLMediaElement.prototype.play not implemented`) from `ScreenSharePreview.tsx`; not a failure.

---

## 5. What could not be fully assessed

A launch audit should be explicit about coverage gaps:

-   **Runtime/E2E behaviour.** The browser launch-smoke, navigation-audit, and state-explosion Playwright suites require a live stack (Synapse + MAS, seeded Matrix users, TURN, media bucket, recovery-email inbox) that this environment does not provide; they self-skip. Several also do not run in CI today. **Real end-to-end user-journey validation against a production-like stack has not been performed and must be before GA.**
-   **Load & performance.** No valid load-test data exists (L8). p95/p99 latency, throughput ceilings, and the DB connection-pool behaviour under concurrency are unmeasured.
-   **Cryptographic review.** The first-party dead-drop PQ-hybrid crypto (`packages/blackout-protocol/src/deaddrop/crypto/`) was sanity-checked structurally, not formally reviewed. A product making PQ E2EE claims should commission an independent cryptographer.
-   **Media-plane E2EE.** Per the project's own threat model, call/townhall media is TLS-only to the LiveKit SFU (SFrame E2EE is planned, not shipped) — the SFU operator sees plaintext media. This contradicts an unqualified "end-to-end-encrypted" claim for voice/video and should be disclosed until SFrame ships.
-   **Vendored upstreams.** The Synapse and Cinny/Element forks were not line-audited; ensure upstream security advisories are tracked (`upstream-advisories.yml` exists but is failing).

---

## 6. Strengths (what is done well)

Balance matters for a credible go/no-go. The following are genuine, verified strengths:

-   **Cryptographic hygiene.** Constant-time HMAC comparison with length guard; `scrypt` password hashing with a precomputed dummy hash for enumeration resistance; boot-time JWT secret-strength validation with a weak-secret blocklist; multi-secret rollover; AES-256-GCM envelopes with row-scoped AAD preventing ciphertext substitution; refresh-token rotation with reuse detection and family-burn.
-   **Payments are well-built.** Webhook signatures (Stripe/Lago/Patreon) verified in constant time _before_ processing; fee math uses integer cents and basis points (`Math.round((grossCents * feeBps) / 10_000)`); marketplace webhooks are idempotent (`hasProcessedWebhookEvent` / `markWebhookProcessed`).
-   **Authorization is consistent almost everywhere.** The pass-through auth model is correctly backed by per-route `requireUser` + ownership assertions across the large majority of routes; admin is a server-side allowlist, not a client capability. The coalition PATCH gap (M1-M3) is the exception, not the rule.
-   **Defensive server posture.** Strict hand-rolled CSP (`default-src 'none'`), HSTS preload, COOP/CORP, restrictive Permissions-Policy; CORS fails closed in production; placeholder marketplaces fail _closed_ at boot.
-   **Strong engineering discipline.** Exactly one TODO/FIXME marker in all first-party source; 138 migrations with up/down pairs and a PGlite ephemeral round-trip test; an extensive CI guard framework; a broad ops/runbook/DR corpus with a passing nightly backup-restore drill; a client crash boundary (`CrashBoundary.tsx`); no secrets in the client bundle (`import.meta.env` exposes only non-secret `VITE_*` values); SRI on built assets.

---

## 7. Dimension notes

Concise per-dimension takeaways (full findings mapped above):

-   **Authz/BOLA:** Sound model, one localized gap in `coalition.ts` (3 handlers). No blocker-level bypass to funds, tokens, or PII found.
-   **JWT/crypto:** Primitives strong; the real gap is session-revocation completeness (H9), not algorithm confusion (L1, refuted as exploitable).
-   **WS shims / network:** The sharpest reliability exposure (H1); the SSE path is better (inside the chain) but leaks its token in the URL (M8).
-   **Input validation:** Prior concern **overstated** — webhook signature order is correct and proxies have real SSRF guards. Genuine gaps are body-size limit (M5) and a non-constant-time appservice compare (L3).
-   **Config/boot/reliability:** Partial, ad-hoc safety. Shutdown + loop-doubling + rate-limit-fail-open (H2/H4/H5) are the launch-relevant trio.
-   **Data layer:** Good migration tooling; `file` default (H6) and write-behind loss (H3) are the risks; checksum-not-verified (M12) is a drift hazard.
-   **CI/tooling integrity:** Impressive surface, materially inert in places (H7, M13, M14, M15, M21) — a false-assurance risk for go/no-go.
-   **Deployment:** Working stack exists but is surrounded by rot (H10).
-   **Incomplete features:** Not sloppy TODOs — headline OPSEC features backed by stubs (C1, M16, M17, M19) plus a stalled defect loop (M20).
-   **Payments:** A strength (see §6).
-   **Legal:** The other hard blocker (H11).

---

## 8. Prioritized remediation checklist

### P0 — must fix before GA (launch blockers)

-   [ ] **C1** Implement an autonomous, leader-elected dead-man's-switch sweep — or remove/relabel the feature and disclose it. _(days)_
-   [ ] **H11** Publish first-party Privacy Policy + ToS; wire `TermsStage`; confirm AGPL source-offer in-app. _(days, needs legal input)_
-   [ ] **H8** Resolve the 4 high-severity dependency advisories; make audit/OSV blocking on release. _(hours–days)_
-   [ ] **H1** Harden the three WS shims (auth/idle timeout, `maxPayload`, upgrade rate-limit, origin allowlist, session caps). _(days)_
-   [ ] **H2 + H3** Unconditional graceful shutdown that closes the HTTP server and drains the write-behind queue on every exit path; make critical (payment/security) writes synchronous. _(days)_
-   [ ] **H6** Default to `postgres` in production or refuse to boot without a durable mode. _(hours)_
-   [ ] **H10** Delete/fix broken deploy entry points (`index.js`, root `Dockerfile.blackout`, stale nginx image); designate one canonical stack. _(hours–days)_
-   [ ] **M16 + M17** Persist canary-tripwire and mesh-relay state (or disclose the in-memory limitation for OPSEC features). _(days)_

### P1 — fix before GA or immediately after, with a plan

-   [ ] **H4** Leader election for background loops; safe default. **H5** Fail-closed rate limiting on sensitive buckets; require `REDIS_URL` in prod.
-   [ ] **H7** Make the security CI lane blocking on release; run full-history `gitleaks detect` once.
-   [ ] **H9** Enforce access-token revocation (revocation epoch or short TTL).
-   [ ] **M1-M3** Add ownership/membership checks to the coalition PATCH handlers.
-   [ ] **M5** Global request body-size limit. **M7** Central `app.onError`/`app.notFound`. **M9/M10** Trim `/health`; enforce `LOG_HASH_SALT` in prod.
-   [ ] **M14** Run the SOPS key ceremony (real age recipients) or remove SOPS from the documented path. **M13** Fix or remove SonarQube config. **M15** Add least-privilege `permissions:` to the 9 workflows.
-   [ ] **M20** Restart the defect-intake loop (create `docs/launch/builds/`, populate `KNOWN_ISSUES.md`).
-   [ ] Perform a real E2E + load test against a production-like stack (fix **L8** first); record p95/p99 against the go/no-go KPI gates.

### P2 — hygiene / hardening

-   [ ] **M4** Confirm homeserver registration is Blackout-exclusive or harden `matrix/exchange`. **M6** Introduce an env-schema (e.g. zod) validated at boot. **M8** Move the SSE token out of the URL. **M11/M12** Reconcile multi-replica docs; verify migration checksums. **M18** Make the dead-drop parity test actually compare implementations. **M19** Implement or clearly gate the plugin sandbox RPC. **M21** Wire `guard:auth-secrets`/GitGuardian; add lint/secret-scan to pre-commit.
-   [ ] **L1-L9** Address as capacity allows; **L4** (`redirect: 'manual'`) and **L3** (constant-time compare) are quick wins.
-   [ ] Refresh the stale, self-certified readiness docs (`docs/audits/production_readiness_2026_05.md` etc.) to reflect current surface.

---

## 9. Go/No-Go gate (proposed)

Launch to GA when **all** hold:

1. All **P0** items closed and independently re-verified.
2. Security audit/OSV/secret-scan **blocking** and green on the release commit; zero high/critical advisories in the prod tree.
3. A real E2E smoke run and a valid load test pass against a production-like stack, meeting the documented KPI gates.
4. Privacy Policy + ToS published and legally reviewed; OPSEC feature claims match shipped behaviour (or are disclosed).
5. One canonical, tested production deployment path, with graceful rolling deploys demonstrated (no dropped requests, no lost writes).

---

_Prepared as an independent pre-launch readiness audit. Evidence for every Critical/High finding was confirmed first-hand at the cited `file:line` against commit `1775a93`. Medium/Low findings marked `[reported]` warrant a confirmation pass before remediation sign-off._

---

## Appendix B — Remediation status

Fixes landed on branch `claude/pre-launch-app-audit-mp0yvg` (PR #857) after the audit. Each was verified before commit (`@blackout/api` typecheck clean; API suite **1318/1318**; `pnpm build` green; `pnpm audit --prod` clean with documented ignores).

| ID        | Finding                                    | Status                                                                            |
| --------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| C1        | Dead-man's switch never fires autonomously | ✅ Fixed — server-side sweep loop (`deadmanSweepScheduler`, on by default) + test |
| H1        | WS shims outside middleware / DoS          | ✅ Fixed — frame caps + unauthenticated idle timeout on Twitch/OBS shims          |
| H2        | Graceful shutdown only in postgres mode    | ✅ Fixed — unconditional shutdown; closes HTTP server + drains                    |
| H4        | Background-loop double-processing at scale | ✅ Fixed — Postgres advisory-lock leader election (fails safe)                    |
| H5        | Rate limiter fails open                    | ✅ Fixed — auth bucket fails closed on store error                                |
| H6        | Default `file` DB mode in production       | ✅ Fixed — production refuses to boot unless `BLACKOUT_DB_MODE=postgres`          |
| H7        | Security CI lane cannot fail a build       | ✅ Fixed — pnpm audit + Trivy blocking; documented, time-boxed ignores            |
| H8        | High-sev dependency advisories             | ✅ Fixed — postcss/tar/brace-expansion patched (react-router: see below)          |
| H9        | Access-token revocation incomplete         | ✅ Fixed — per-user revocation cutoff on revoke-all / password change / reuse     |
| H10       | Rotted deploy entry points                 | ✅ Fixed — `index.js`, `Dockerfile.blackout`, CI web image repaired               |
| H11       | No Privacy Policy / ToS                    | ⚠️ Drafted — templates under `docs/legal/`, **counsel review required**           |
| M1/M2     | Coalition needs/resources BOLA             | ✅ Fixed — ownership checks + regression tests                                    |
| M7/M9/M10 | onError, /health disclosure, log salt      | ✅ Fixed                                                                          |
| M15       | 9 workflows over-scoped                    | ✅ Fixed — least-privilege `permissions:`                                         |

**Deferred (need product/architecture decisions):**

-   **react-router 7→8** (H8 remainder): the entire react-router 8 line requires **React ≥19.2.7**; the client is on React 18.2 and `folds` peers on React 17, so this is a React 18→19 migration, not a router bump. The advisory (GHSA-qwww-vcr4-c8h2) is RSC-mode-only and the client uses library mode, so it does not apply — silenced with a time-boxed, documented ignore (`osv-scanner.toml`, `pnpm.auditConfig`) that expires 2026-10-31 to force re-evaluation.
-   **M3** (coalition _task_ BOLA): needs a den-membership model (or a task-creator column + migration).
-   **H3** (write-behind durability), **M4/M5/M8/M11/M12/M16-M20**, and the runtime **E2E + load-test** validation (§5) remain from the checklist.
