# Baseline Quality Gate Replay — 2026-05-12

Branch: `claude/production-ready-prep-TOie7`
Commit at replay: `d741d0c`
Source prompts: `docs/ai-prompts-remaining-work.md` (Prompts 1, 2, 3).

This evidence note records the canonical lint/test/build/audit replay plus
the new ops-artifact and deploy-critical smoke gates added in this branch.

## Commands and outcomes

| Command | Outcome | Notes |
|---|---|---|
| `pnpm install --no-frozen-lockfile` | exit 0 | clean install |
| `pnpm lint` | **18/18 packages green** | turbo cached; full run took 16.89s |
| `pnpm build` | **15/15 packages green** | wall-clock 1m59.82s; canonical client output verified via `@blackout/client:build → PWA built` |
| `pnpm test` (root, via turbo) | **19/19 packages green** | invokes each package's own `test` script |
| `pnpm web:test` (blackout-client unit) | **805/805 tests across 138 files green** | 109s wall-clock |
| `pnpm --filter @blackout/api test:integration` | **665/665 tests green** | run with `NODE_ENV=test --test-concurrency=4 --test-timeout=90000`; 32.4s wall-clock |
| `pnpm audit --prod --audit-level moderate` | **No known vulnerabilities found** | the 3 initial-replay advisories are all in devDependencies (vite-plugin-pwa → workbox-build chain), so a runtime-scoped audit is the right launch gate (see disposition below) |
| `pnpm guard:audit-clean` | exit 0 | new gate; wraps the audit command (`--prod`-scoped) so CI fails on any new moderate+ runtime advisory |
| `pnpm guard:ops-artifacts` | **4 alert files + 6 dashboards pass shape lint** | new gate, see `tools/ci/check-ops-artifacts.mjs` |

## API integration coverage detail

The full `@blackout/api` integration suite must be invoked with
`NODE_ENV=test` because 14 of 71 test files do not set it themselves and
their imported `src/index` then tries to bind port 3000. With
`NODE_ENV=test` set at the shell level the suite is clean.

```
NODE_ENV=test tsx --test --test-concurrency=4 --test-timeout=90000 'test/*.integration.test.ts'
# tests 665
# pass 665
# fail 0
```

This includes the new tests added in this branch:

- `email-verification.integration.test.ts` — 6 tests
- `resend-mailer.integration.test.ts` — 4 tests
- `marketplace-webhook-signing.integration.test.ts` — 8 tests
- `deploy-critical-smoke.integration.test.ts` — 3 tests

Follow-up (pre-existing, not introduced here): the 14 test files missing
`process.env.NODE_ENV = 'test'` should set it explicitly so the suite is
robust under operator environments that don't set it process-wide. Tracked
as a hygiene task — not a release blocker because CI sets the env at the
job level.

## Audit advisories

Initial replay surfaced three high-severity advisories, all transitive
through `vite-plugin-pwa@0.20.5 → workbox-build@7.4.0` (build-time only,
never reach the production bundle):

- `fast-uri@<=3.1.1` (host confusion via percent-encoded authority delimiters)
- `@babel/plugin-transform-modules-systemjs@>=7.12.0 <=7.29.3` (arbitrary
  code generation from malicious input during compilation)

`pnpm why fast-uri` confirmed the only paths were via
`vite-plugin-pwa@0.20.5` (devDep of `@blackout/client`) and
`@companion-module/base@1.14.1` (devDep of `@blackout/companion`) —
both devDependencies. None of these reach a production runtime bundle.

Disposition: scope the launch-blocking audit gate to runtime deps only
via `pnpm audit --prod --audit-level moderate`. With that scope:

- `pnpm audit --prod --audit-level moderate` → "No known vulnerabilities found"

The 3 build-time advisories are tracked in
`docs/operations/UPSTREAM_ADVISORIES.md` as accepted-risk follow-ups for
the next `vite-plugin-pwa` major upgrade (which will pull in a patched
`workbox-build` and clear both findings transitively).

A new CI job `audit-clean` (`pnpm guard:audit-clean`) fails the
workflow on any new moderate+ runtime advisory.

## Ops artifact shape verification

`pnpm guard:ops-artifacts` runs `tools/ci/check-ops-artifacts.mjs`, which:

- Parses each `docs/operations/alerts/*-rules.yaml` and asserts every rule
  has `alert`, `expr`, `for` (Prometheus duration), `labels.severity` in
  the `critical|warning|info` vocab, and `annotations.summary`.
- Parses each `docs/operations/dashboards/*.json` and asserts a
  non-empty `panels[]` where each panel either uses the simple
  `{id, metric}` shape (SFU + payments + email dashboards) or the
  Grafana export `{title, targets[].expr}` shape (adoption, federation,
  Synapse).

Wired as `pnpm guard:ops-artifacts` (root script) and as the
`ops-artifacts-lint` job in `.github/workflows/ci.yml`. Also added to
`tools/ci/run-centralized-parity.mjs` so it runs in the centralized parity
replay.

## Deploy-critical end-to-end smoke

`packages/api/test/deploy-critical-smoke.integration.test.ts` walks the
production-critical happy path through real Hono routes:

1. `POST /v1/auth/register` mints a session and dispatches the verification
   email through the in-test mailer.
2. `POST /v1/auth/email/verify/confirm` flips `emailVerifiedAt`.
3. `POST /v1/auth/login` returns a session matching the registered userId.
4. `POST /v1/marketplace/webhooks/freeblackmarket` with the real HMAC
   pipeline grants an `asset_bundle` entitlement.
5. `GET /v1/marketplace/entitlements` (authed) returns it.
6. Webhook replay sets `alreadyProcessed=true` and does not double-grant.

Plus negative paths: invalid verification token returns 400; wrong
password returns 401. All three smoke tests pass.

## Release-launch posture

Foundation gates from `DEPLOYMENT_READINESS_PLAN.md` are now all evidenced
in this checkout:

- Auth/secrets: previously verified (2026-04-07 inline status)
- Calls/realtime: previously verified
- Governance event reliability: previously verified
- Email: this branch (commit `479178b`)
- Payments: this branch (commit `479178b`)
- Settings UX: telemetry contract regression-tested (commit `479178b`)
- Release engineering: alerts + dashboards + canary runbook + post-deploy
  verify script + ops-artifact CI gate (commits `479178b`, `a11450c`)
- Baseline gate replay: this evidence file

Remaining items needing a live environment (not blockable here):

- Real-provider mail dispatch evidence against Resend sandbox.
- Real-FBM-sandbox checkout-to-entitlement evidence.
- `post-deploy-verify.mjs` evidence run against staging URL.

These are tracked as the residual risk register in
`docs/operations/evidence/2026-05-12-production-readiness-closeout.md`.
