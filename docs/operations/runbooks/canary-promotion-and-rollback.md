# Canary Promotion + Rollback Runbook

## Goal
Promote a release through staging → canary → production with explicit traffic
ramps, abort criteria, and a tested rollback path. Every promotion records an
evidence artifact under `docs/operations/evidence/`.

## Scope
Applies to the production API + web surfaces deployed via
`.github/workflows/deploy-compose-prod.yml` and `deploy-web.yml`. Feature-flag
rollouts (per-cohort enablement) are covered by
[`feature-preset-rollout-and-rollback.md`](feature-preset-rollout-and-rollback.md);
this document covers the underlying *deploy* lifecycle.

## Stage gates

| Stage | Traffic share | Required dwell | Manual gate |
|---|---|---|---|
| Staging | 0% (synthetic only) | 30m | Smoke pass + post-deploy verify pass |
| Canary  | 10% real traffic    | 60m | SLO/alert review |
| 50%     | 50% real traffic    | 60m | SLO/alert review |
| 100%    | full rollout        | n/a | Post-deploy verify pass |

Each promotion must satisfy *every* row above its target stage in the same
release window.

## Per-stage checklist

### Staging
1. Workflow deploys to staging environment.
2. Run `node tools/ci/post-deploy-verify.mjs` with `POST_DEPLOY_BASE_URL` set to
   the staging origin. All checks must return `ok: true`.
3. Run the call synthetic probe: `pnpm probe:calls:synthetic`.
4. Confirm `email_verification` send rate is non-zero and 0 failures in
   `mail_send_failures_total` for the deploy window.
5. Confirm at least one marketplace webhook received and processed (use the
   staging stub provider or a real-FBM staging event).

### Canary (10%)
1. Apply traffic shift (10% to new revision). Record start time.
2. Confirm `auth_failures_total` ratio < 1% of `http_requests_total` on the
   /v1/auth/* surface for the dwell window.
3. Confirm no firing alerts from:
   - `auth-alert-rules.yaml`
   - `email-alert-rules.yaml`
   - `payments-alert-rules.yaml`
   - `townhall-sfu-alert-rules.yaml`
4. Confirm `mail_send_failures_total{reason="retries_exhausted"}` is flat.
5. Confirm `marketplace_webhook_rejected_total{reason="signature-mismatch"}`
   is flat.
6. If a SEV-1 paging alert fires during dwell, abort to rollback.

### 50%
Same checks as Canary; require double the dwell evidence (i.e. two
consecutive 30m windows of clean alert state).

### 100%
Apply final traffic shift. Re-run `post-deploy-verify.mjs` against the
production origin. Save the JSON output to the evidence file.

## Abort criteria (rollback immediately)

Any one of:
- HTTP 5xx ratio on `/v1/auth/login` or `/v1/marketplace/checkout` exceeds 5%
  for 5 minutes.
- `MailSendFailureRateHigh` alert fires.
- `MarketplaceWebhookSignatureFailuresSpike` fires.
- `RefreshTokenReuseSpike` fires.
- `post-deploy-verify.mjs` returns a non-zero exit code post-promotion.
- An on-call engineer judges user-visible impact (login loops, blank dashboards,
  doubled charges) regardless of metric state.

## Rollback procedure
1. Trigger the previous-revision deployment workflow (single-button revert in
   the deploy workflow UI; the underlying job re-pins the previous image tag
   and re-runs `post-deploy-verify.mjs`).
2. Restore traffic shift to 100% on the prior revision.
3. If the rolled-back revision still alerts, declare an incident per
   `oncall_escalation_tree.md`.
4. Capture the failing evidence in
   `docs/operations/evidence/<date>-canary-rollback.md` (alert screenshots,
   `post-deploy-verify` output, traffic-shift timestamps).

## Promotion evidence artifact
Each promotion run produces a markdown file:

```
docs/operations/evidence/<YYYY-MM-DD>-canary-<release-tag>.md
```

Required sections:
- Release tag + commit SHA.
- Post-deploy verify output for each stage.
- Alert + SLO snapshot at each gate.
- Decision (promote / hold / abort) with timestamp + owner.

## Verification
- `node tools/ci/post-deploy-verify.mjs` returns exit 0 with all checks
  `ok: true`.
- No alert rules fire during the canary dwell window.
- The release tag is referenced from the evidence artifact and
  `docs/rollout-readiness-status.md` is updated with the new baseline.
