# Production Readiness Closeout — 2026-05-12

Branch: `claude/production-ready-prep-TOie7`
Base commit (pre-changes): `7e62550`
Source plan: `docs/DEPLOYMENT_READINESS_PLAN.md`

## Workstream status delta

| Workstream | Before | After |
|---|---|---|
| 1. Payments / freeblackmarket | Provider impl present, no webhook tests, no alerts/dashboards | Webhook-signing + replay + refund/chargeback integration tests; alert rules + dashboard added |
| 2. Email verification | `resend.ts` was a 3-line stub; no token lifecycle; `setMailer()` never called at boot | Real `ResendMailer` with retry/backoff; token lifecycle service; `initMailerFromEnv()` wired into bootstrap with production-refuse fallback; verification routes + resend cooldown; integration tests |
| 3. Auth / secret hardening | Done | Unchanged |
| 4. Settings UX telemetry | Telemetry helpers present but no regression test of the contract | Unit test of `settingsTelemetry.ts` contract |
| 5. Calls / Realtime | Done | Unchanged |
| 6. Governance / DeadDrop event reliability | Done | Unchanged |
| 7. Release engineering / observability | Single SFU alert rule file, no payments/email alerts, no post-deploy verify | `auth-alert-rules.yaml`, `email-alert-rules.yaml`, `payments-alert-rules.yaml`, `email_delivery_dashboard.json`, `payments_dashboard.json`, `canary-promotion-and-rollback.md` runbook, `tools/ci/post-deploy-verify.mjs` wired into all three deploy modes |

## Code surface changed

### packages/api (server)
- `src/db/types.ts` — added `emailVerifiedAt` to `UserRecord`; new `EmailVerificationTokenRecord`.
- `src/db/store.ts` — new map + 7 helper methods for verification tokens; persistence hydrate/snapshot updated; `markUserEmailVerified`.
- `src/services/emailVerification.ts` — issue/consume token lifecycle with resend cooldown + email-change detection.
- `src/services/mailer.ts` — added `initMailerFromEnv()` (provider-required in production; refuses to start with `MAIL_PROVIDER` unset).
- `src/integrations/resend.ts` — real Resend transport: exponential backoff with jitter, retryable 5xx/429 detection, fail-fast on 4xx, metrics-instrumented.
- `src/routes/auth.ts` — registration now mints + dispatches the verification email; new endpoints `POST /v1/auth/email/verify/request` and `/confirm`; bearer-required for resend with email-mismatch guard.
- `src/telemetry/metrics.ts` — added `mail_send_attempts_total`, `mail_send_failures_total`, `mail_send_duration_seconds`, `email_verification_tokens_issued_total`, `email_verification_tokens_consumed_total`, `marketplace_webhooks_total`.
- `src/index.ts` — bootstrap calls `initMailerFromEnv()`; throws in production when no provider is configured.

### Tests
- `packages/api/test/email-verification.integration.test.ts` — 6 tests covering register → email → confirm, resend + cooldown, email-mismatch, email-changed, already-verified, mailer-failure surface.
- `packages/api/test/resend-mailer.integration.test.ts` — 4 tests covering happy path, transient retry, non-retryable 4xx, max-attempts.
- `packages/api/test/marketplace-webhook-signing.integration.test.ts` — 8 tests covering valid HMAC, missing signature, forged signature, idempotent replay, refund, chargeback, malformed payload, unknown provider.
- `apps/blackout-client/src/app/features/settings/settingsTelemetry.test.ts` — 4 tests on the telemetry event contract.

### Ops surface
- `docs/operations/alerts/auth-alert-rules.yaml`
- `docs/operations/alerts/email-alert-rules.yaml`
- `docs/operations/alerts/payments-alert-rules.yaml`
- `docs/operations/dashboards/email_delivery_dashboard.json`
- `docs/operations/dashboards/payments_dashboard.json`
- `docs/operations/runbooks/canary-promotion-and-rollback.md`
- `tools/ci/post-deploy-verify.mjs`
- `.github/workflows/deploy-compose-prod.yml` — invoke `post-deploy-verify.mjs` in `canary`, `promote`, and `full-rollout` jobs.

## Verification commands and results

API integration suite (subset most affected by changes):

```
tsx --test \
  packages/api/test/auth-lifecycle.integration.test.ts \
  packages/api/test/auth-security.integration.test.ts \
  packages/api/test/email-verification.integration.test.ts \
  packages/api/test/resend-mailer.integration.test.ts \
  packages/api/test/freeblackmarket-stub.integration.test.ts \
  packages/api/test/marketplace-webhook-signing.integration.test.ts
```

Result: `tests 31 / pass 31 / fail 0`.

Settings telemetry (blackout-client unit):

```
vitest run \
  src/app/features/settings/settingsTelemetry.test.ts \
  src/app/features/settings/theme-parity.test.ts \
  src/app/features/settings/security/encryptionPosture.test.ts
```

Result: `Test Files 3 passed / Tests 20 passed`.

Ops artifact validation:

```
python3 -c "yaml.safe_load(open(f))"   # for each alerts/*-rules.yaml
python3 -c "json.load(open(f))"        # for each dashboards/*.json
node -c tools/ci/post-deploy-verify.mjs
python3 -c "yaml.safe_load(open('.github/workflows/deploy-compose-prod.yml'))"
```

Result: all pass.

## Production-launch posture after this change

Blockers from `DEPLOYMENT_READINESS_PLAN.md` cleared:

- Email is no longer silent in production: registration emits a verification mail, `initMailerFromEnv()` throws in `NODE_ENV=production` without `MAIL_PROVIDER`, and resend exposes failure-rate metrics that the email alert rules consume.
- Marketplace webhook signing, replay, refund, and chargeback paths have explicit test coverage that exercises the production HMAC pipeline (not the stub variant).
- Every deploy mode now runs `post-deploy-verify.mjs` against `PROD_PUBLIC_URL` and exits non-zero on any failed check, gating the workflow.
- Auth, email, and payment SLOs each have at least one paging or warning alert rule; the canary runbook explicitly references them as abort criteria.

Follow-ups intentionally out of scope here:

- Real staging end-to-end against `freeblackmarket.com` sandbox (`POST_DEPLOY_BASE_URL` evidence run pending against a live environment).
- Playwright visual regression for the settings shell (deferred — needs fixture setup beyond this audit).
- Payments KPI panels in a real Grafana instance (JSON shape committed; Grafana import pending operator).

## Residual risk register update

- Mailer transport currently supports `resend` + `console`. SMTP fallback is not yet implemented; if Resend has a regional outage the failover path is documented in the alert runbook but does not automate.
- The post-deploy verify script's authed self-check is opt-in (`POST_DEPLOY_BEARER`); without it, only public health surfaces are exercised.
