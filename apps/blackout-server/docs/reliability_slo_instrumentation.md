# Reliability SLO instrumentation

_Date: 2026-02-20_
_Owner: SRE Lead_

This document defines the direct measurements used for each reliability SLO in
`docs/scope_alignment_evidence.md`.

## 1) Availability SLO instrumentation

**SLO objective:** monthly API availability >= 99.95%.

### SLI formula

```
availability =
  sum(rate(synapse_http_server_responses_total{code=~"2..|3..",authenticated="true"}[5m]))
  /
  sum(rate(synapse_http_server_responses_total{authenticated="true"}[5m]))
```

### Required metric streams

- `synapse_http_server_responses_total` (labels: `code`, `servlet`, `method`).
- `blackout_authenticated_requests_total` (new counter; labels: `outcome=success|failure`, `servlet`).
- `blackout_request_latency_seconds` (new histogram for authenticated endpoints).

### Collection + dashboard contract

- Scrape interval: 15s in production, 30s in staging.
- Dashboard panels:
  - 5m/1h/30d availability burn-down.
  - authenticated request error rate by servlet.
  - p95/p99 authenticated request latency.

## 2) Federation recovery SLO instrumentation

**SLO objective:** backlog returns to baseline within 15 minutes.

### SLI formula

```
federation_recovery_success =
  incidents_meeting_target_15m / total_recovery_incidents
```

### Required metric streams

- `synapse_federation_transaction_queue_pending` (gauge).
- `synapse_federation_transaction_queue_processing_seconds` (histogram).
- `blackout_federation_backlog_baseline` (new gauge; rolling 7-day p50 baseline).
- `blackout_federation_recovery_window_total` (new counter; labels: `result=met|missed`).

### Collection + dashboard contract

- Recovery timeline panels at T+0, T+5m, T+10m, T+15m.
- Alert annotations must include incident ID and queue depth snapshot.

## 3) Data durability / DR SLO instrumentation

**SLO objective:** RPO <= 1 minute; RTO <= 5 minutes.

### SLI formulas

```
rpo_seconds = max(wal_shipping_lag_seconds, replica_replay_lag_seconds)
rto_seconds = failover_complete_timestamp - failover_start_timestamp
```

### Required metric streams

- `postgres_wal_receiver_lag_bytes` and derived `postgres_wal_receiver_lag_seconds`.
- `postgres_replication_replay_lag_seconds`.
- `blackout_failover_events_total` (new counter; labels: `result=success|failed`).
- `blackout_failover_duration_seconds` (new histogram).

### Collection + dashboard contract

- WAL lag panel with 1m objective marker.
- Failover duration panel with 5m objective marker.
- Drill scorecard panel (last 4 quarterly drills).

## 4) Instrumentation delivery checklist (C2)

- [x] Metrics catalog defined per SLO objective.
- [x] Prometheus query formulas documented for each SLI.
- [x] Dashboard panel requirements listed for operator visibility.
- [x] Ownership and scrape contracts documented.
