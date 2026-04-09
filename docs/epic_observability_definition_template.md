# Epic Observability Definition Template

Use this template to define logs, metrics, traces, dashboards, and alerts for any epic before implementation starts.

## 1) Logs (Structured Fields)

Emit JSON logs for every state transition and external dependency call.

### Required fields (all events)
- `timestamp` (ISO-8601 UTC)
- `level` (`DEBUG|INFO|WARN|ERROR`)
- `service` (e.g., `blackout-web`, `blackout-api`)
- `environment` (`prod|staging|dev`)
- `epic` (epic key/name)
- `feature` (sub-capability)
- `event_name` (stable snake_case)
- `trace_id`, `span_id`
- `request_id` (if request-scoped)
- `user_id_hash` (never raw PII)
- `session_id`
- `tenant_id` / `room_id` (if multi-tenant or room-scoped)
- `outcome` (`success|failure|partial`)
- `error_code` (stable taxonomy, nullable)
- `error_class` (nullable)
- `latency_ms` (if measurable)

### Event families to instrument
- **Ingress**: request accepted, validated, rejected.
- **Business flow**: start/checkpoint/complete for each major step.
- **Egress**: calls to DB/cache/queue/external APIs with status and retry count.
- **Security/compliance**: auth decisions, permission denials, policy enforcement.
- **User-impacting failures**: explicit UX-visible failures and fallback path used.

### Logging quality gates
- No secrets/tokens/passwords in logs.
- Every `ERROR` must include `error_code` and `trace_id`.
- Sampling allowed for `INFO`, not for `WARN/ERROR`.

---

## 2) Metrics (SLI/SLO Candidates)

Define a small set of user-centric SLIs first, then supporting technical metrics.

### Core SLI candidates
1. **Availability SLI**
   - Definition: `% of successful epic transactions over total attempts`
   - Numerator: `epic_transactions_total{outcome="success"}`
   - Denominator: `epic_transactions_total`
2. **Latency SLI (p95)**
   - Definition: `p95 end-to-end transaction latency`
   - Metric: `epic_transaction_latency_ms`
3. **Correctness SLI**
   - Definition: `% transactions completing without functional rollback/retry-visible errors`
   - Metric: `epic_transaction_correct_total / epic_transactions_total`
4. **Freshness/Propagation SLI** (if async)
   - Definition: `% updates reflected within target window (e.g., 60s)`

### Example SLO targets (adjust to tier)
- Availability: **99.9%** per rolling 30 days.
- Latency: **p95 < 1200 ms**, **p99 < 2500 ms**.
- Correctness: **99.95%** successful semantic outcomes.
- Freshness: **99% within 60s**.

### Supporting metrics
- Request rate (`rps`)
- Error rate by `error_code`
- Retry rate and retry success-after-retry
- Dependency latency/error rate (DB, queue, upstream)
- Saturation (CPU, memory, queue depth, worker concurrency)

---

## 3) Traces

Instrument distributed tracing across client/API/worker/dependencies.

### Span model
- Root span: `epic.transaction`
- Child spans:
  - `epic.validate_input`
  - `epic.authorize`
  - `epic.read_state`
  - `epic.apply_business_logic`
  - `epic.write_state`
  - `epic.emit_side_effects`
  - `dependency.<name>.<operation>`

### Trace attributes
- `epic`, `feature`, `tenant_id`, `request_id`, `user_id_hash`
- `outcome`, `error_code`, `retry_count`, `idempotency_key`
- `release_version`, `runtime`, `region`

### Trace usage goals
- Must reconstruct one full user transaction from ingress to completion.
- Must identify slowest span for p95/p99 paths.
- Must support correlation from alert -> dashboard -> trace -> logs in <5 minutes.

---

## 4) Dashboards

Create role-based dashboards with drill-down links.

### A. Executive / Product dashboard
- Availability SLI (30d, 7d)
- p95/p99 transaction latency
- User-facing failure rate
- Volume trend and adoption

### B. On-call operational dashboard
- Error budget burn (1h / 6h / 24h)
- Error rate by `error_code`
- Dependency health (latency/error/saturation)
- Queue depth + worker backlog age (if async)
- Top failing routes/operations

### C. Debug dashboard
- Heatmap of latency by route/feature/tenant
- Retry funnels (first attempt vs recovered)
- Release-over-release regressions
- Links to representative traces and structured log queries

---

## 5) Alert Thresholds

Use multi-window, multi-burn-rate alerts to reduce noise.

### Page-worthy (SEV-1/SEV-2)
- **Fast burn**: error budget burn rate > 14x for 5m.
- **Sustained burn**: error budget burn rate > 6x for 1h.
- **Hard availability breach**: success rate < 99.0% for 10m.
- **Critical latency breach**: p99 latency > 4s for 15m (high traffic guardrail).

### Ticket/Slack (non-page)
- p95 latency above SLO for 30m.
- Retry rate > 5% for 30m.
- Dependency error rate > 2% for 15m.
- Queue lag above threshold (e.g., >120s) for 15m.

### Alert payload requirements
- Must include: impacted SLI, current vs SLO, burn rate, likely scope (feature/tenant/region), top `error_code`, and links to dashboard + traces + log query.

---

## 6) Epic-Specific Fill-In Section

Copy and fill for your epic:

- **Epic name / key**:
- **User journey measured**:
- **Primary success event**:
- **Failure events**:
- **Chosen SLIs**:
- **Final SLO targets**:
- **Key dependencies**:
- **Dashboard URLs**:
- **Page alerts enabled**:
- **Runbook URL**:
- **Owner / On-call rotation**:

