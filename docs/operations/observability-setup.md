# Observability setup — operator guide

**Audience**: SRE / platform operators standing up Blackout for the first
time, or onboarding a new environment (staging, canary, production).
**Outcome**: Prometheus is scraping the API's `/metrics`, OpenTelemetry
traces and (optionally) Sentry errors are flowing to chosen backends,
and Grafana renders the dashboards committed under
`docs/operations/dashboards/`.

The code paths (`/metrics`, `initTracing()`, `initErrorReporter()`,
counter/histogram instruments) are wired in `packages/api/src`; this
guide covers the cluster-side wiring an operator needs to enable them.

---

## 1. Prometheus — `/metrics` scraping

The API exposes `GET /metrics` in Prometheus text format
(`packages/api/src/index.ts`). The handler is **bearer-gated**:

| Environment | `INTERNAL_METRICS_TOKEN` | Behaviour |
| --- | --- | --- |
| any | unset (dev) | `/metrics` returns 200 with no auth — never in production |
| any | set | `Authorization: Bearer <token>` required; otherwise 401 |
| `NODE_ENV=production` | unset | refuses with 503 `metrics_token_missing` |

### Set the token

1. Generate a long random value: `openssl rand -base64 48 | tr -d '=+/'`.
2. Store it in the deploy secret store:
   - Compose: append to `deploy/docker/production/.env`
     (also referenced by `docker-compose.canary.yml`).
   - Helm / k8s: add to the External Secrets `remoteRefs` in
     `deploy/helm/blackout/values.yaml` under
     `externalSecrets.remoteRefs.INTERNAL_METRICS_TOKEN`.

### Configure Prometheus

Add a scrape config that targets the api service and presents the
token. Example for the Compose stack (Prometheus running alongside
the api container):

```yaml
scrape_configs:
  - job_name: blackout-api
    scrape_interval: 15s
    metrics_path: /metrics
    scheme: http
    authorization:
      type: Bearer
      credentials_file: /run/secrets/internal_metrics_token
    static_configs:
      - targets: ["app:3000", "app_canary:3000"]
```

The `tools/ci/post-deploy-verify.mjs` `metrics-gated` check fails the
deploy if `/metrics` returns 200 without a bearer — that is your
regression alarm if the token is dropped from the env file.

### Confirm metrics are flowing

```bash
curl -s -H "Authorization: Bearer $INTERNAL_METRICS_TOKEN" \
  https://<api-host>/metrics | grep -E "^(auth|mail|email|marketplace|http)_"
```

You should see the instruments defined in
`packages/api/src/telemetry/metrics.ts`:

- `http_requests_total`, `http_request_duration_seconds`
- `auth_failures_total`, `refresh_token_reuses_total`
- `rate_limit_hits_total`
- `mail_send_attempts_total`, `mail_send_failures_total`,
  `mail_send_duration_seconds`
- `email_verification_tokens_issued_total`,
  `email_verification_tokens_consumed_total`
- `marketplace_webhooks_total`

---

## 2. Alert rules + dashboards

The shape-validated artefacts live in version control. Point your
Prometheus / Grafana installations at these files (or import them
through the Grafana UI / configmap on k8s).

### Alert rules

```
docs/operations/alerts/auth-alert-rules.yaml
docs/operations/alerts/email-alert-rules.yaml
docs/operations/alerts/payments-alert-rules.yaml
docs/operations/alerts/sfu-alert-rules.yaml  # pre-existing
```

CI gate `tools/ci/check-ops-artifacts.mjs` (job `ops-artifacts-lint`)
asserts each rule has `alert`, `expr`, `for`, `labels.severity`
(`critical`/`warning`/`info`), and `annotations.summary`.

Import flow on Compose:

```bash
sudo install -o prometheus -g prometheus -m 0644 \
  docs/operations/alerts/*.yaml \
  /etc/prometheus/rules.d/
sudo systemctl reload prometheus
promtool check rules /etc/prometheus/rules.d/*.yaml  # confirm
```

### Dashboards

```
docs/operations/dashboards/email_delivery_dashboard.json
docs/operations/dashboards/payments_dashboard.json
docs/operations/dashboards/*.json   # SFU / RTC dashboards pre-existing
```

Two panel shapes are accepted (`check-ops-artifacts.mjs`):

- `{ id, metric }` (simple) — used by SFU + payments dashboards.
- `{ title, targets: [{ expr }] }` (Grafana export) — used by the
  rest.

Import flow:

1. Grafana → Dashboards → Import → paste JSON.
2. Pin the resulting dashboard to a folder named `Blackout`.
3. Set the data-source variable to the Prometheus you configured
   above.

---

## 3. OpenTelemetry tracing

The api auto-initialises a tracing pipeline at boot via
`initTracing()` (`packages/api/src/index.ts`). When the OTel env vars
are unset it falls back to a no-op exporter and the call is cheap.

### Enable an OTLP collector

Set on the api process:

```env
OTEL_SERVICE_NAME=blackout-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

A starter collector manifest is at
`deploy/kubernetes/phase4/opentelemetry.yaml`. Point the collector
at your trace backend (Tempo, Jaeger, Honeycomb, Datadog) by
editing the `exporters:` block and the corresponding pipeline
receiver/exporter ID.

### Compose-side wiring

If you run the otel-collector container alongside the api stack,
add it as a service in `deploy/docker/production/docker-compose.yml`
and set the env vars above through the `.env` file. The
`http_request_duration_seconds` histogram already provides RED
metrics; OTel spans complement it with per-route traces.

---

## 4. Sentry error reporting

The api initialises Sentry at boot via `initErrorReporter()`. When
`SENTRY_DSN` is unset, the reporter falls back to a noop.

### Enable

```env
SENTRY_DSN=https://<public-key>@<region>.sentry.io/<project-id>
SENTRY_RELEASE=blackout-api@<commit-sha>   # optional but recommended
SENTRY_TRACES_SAMPLE_RATE=0.1              # 0.0–1.0
```

Set these on the api process the same way as
`INTERNAL_METRICS_TOKEN`:

- Compose: append to the production `.env` and `.env.canary`.
- Helm: add to `externalSecrets.remoteRefs`.

### Sentry events worth wiring an alert on

| Sentry pattern | Maps to in code |
| --- | --- |
| `refresh_token_reuse_detected` log line + 401 burst | `packages/api/src/routes/auth.ts` rotate path |
| `mailer:resend retrying` / `mailer:smtp retrying` warn floods | `packages/api/src/integrations/{resend,smtp}.ts` |
| `marketplace_webhook_signature_invalid` 4xx burst | webhook signing tests |

If you already alert on the equivalent Prometheus counters
(`refresh_token_reuses_total`, `mail_send_failures_total`,
`marketplace_webhooks_total{outcome="rejected"}`), Sentry is
duplicate signal — use it for stack-trace fidelity rather than
paging.

---

## 5. Verification checklist

Once the steps above are applied to an environment, the operator
must record evidence under
`docs/operations/evidence/<YYYY-MM-DD>-observability-bringup-<env>.md`.
Minimum checks:

- [ ] `GET /metrics` with valid bearer returns text with
      `# HELP http_requests_total ...` and exits 0 (Prometheus is
      scraping).
- [ ] `GET /metrics` without bearer returns 401 (or 503 in
      production with token unset — that means the rollout missed
      the secret).
- [ ] Prometheus → `up{job="blackout-api"}` is 1.
- [ ] Alertmanager → at least one alert rule resolved (no firing
      criticals) within 10 minutes of boot.
- [ ] Grafana → email + payments dashboards render with real series.
- [ ] OTel collector logs → received spans with
      `service.name=blackout-api`.
- [ ] Sentry project → test event from the running api shows up
      (use `Sentry.captureMessage('blackout-bringup', 'info')` from
      a one-shot script if needed).

---

## 6. Related runbooks

- Auth secret rotation:
  `docs/operations/runbooks/auth-secret-rotation-and-rollover.md`
- JWT rotation: `docs/operations/runbooks/jwt_rotation.md`
- Call realtime incident:
  `docs/operations/runbooks/call-realtime-incident-and-degraded-mode.md`
- Canary promotion + rollback:
  `docs/operations/runbooks/canary-promotion-and-rollback.md`
- Governance event reliability:
  `docs/operations/runbooks/governance-event-reliability.md`
- Postgres restore drill:
  `docs/operations/runbooks/postgres_restore_drill.md`
- Townhall observability:
  `docs/operations/runbooks/townhall-observability-runbook.md`
