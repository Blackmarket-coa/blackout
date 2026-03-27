# Townhall observability and load-gate runbook

## Dashboards

- Join success/failure rate
- p95 join latency
- packet loss / jitter / rebuffer percentiles
- active publishers/subscribers per room
- moderation action latency

## Alerts

- Sustained join failure rate above threshold
- p95 join latency budget breach
- publish authorization error spike
- media node resource saturation

## Load-gate requirements

- 100 participant profile
- 250 participant profile
- 500 participant profile

Each gate must include run metadata, environment, pass/fail criteria, and incident notes.
