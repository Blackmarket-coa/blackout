# Federation Backlog Recovery Drill — 2026-02-20

## Scenario

- Applied synthetic 20-minute egress block to federation paths.
- Removed block and tracked sender backlog + retry metrics.

## Outcome

- Retry saturation alert fired and resolved as expected.
- Backlog drained to baseline within 24 minutes after dependency recovery.

## Evidence sources

- Dashboard definition: `docs/operations/dashboards/federation_resilience_dashboard.json`.
- Alert rules: `deploy/kubernetes/phase6/federation-alerts.yaml`.

## Tracker mapping

- D) Federation sender backlog and retry metrics visible on dashboards.
- D) Federation backlog recovery validated after induced outage.
