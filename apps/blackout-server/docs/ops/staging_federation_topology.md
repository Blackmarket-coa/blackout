# Staging Federation Topology (Phase 1)

Status: Active plan
Owner: SRE/Operations Lead
Last updated: 2026-03-16

## Nodes

- `hs-alpha`: primary implementation candidate.
- `hs-beta`: federation peer for compatibility checks.
- `hs-chaos`: fault-injection node for disruption and rollback drills.

## Shared observability

- Metrics: Prometheus-compatible scraping from all nodes.
- Logs: centralized aggregation with per-node labels.
- Traces: federation transaction path tracing for latency and retry analysis.

## Minimum validation scenarios

1. Cross-node room join/leave and membership propagation.
2. Dead-drop retention expiry and purge verification.
3. Announcement fanout behavior under normal and degraded network conditions.
4. Quarantine + rollback runbook rehearsal.

## Exit metrics (Phase 1)

- Federation transaction success rate meets baseline target under normal load.
- Dead-drop purge compliance meets SLA in repeated runs.
- No high-severity policy-leak defects across cell boundaries.

## Artifacts

- Validation report: `docs/reports/phase1_validation_report.md`
- Go/no-go decision: `docs/reports/phase2_go_no_go_decision.md`
- Drill evidence: `docs/reports/staging_drill_report_2026-03-16.md`
- Phase completion: `docs/reports/phase1_completion_report_2026-03-16.md`


## Federation compatibility test fixtures (BO-103/BO-302)

- ACL trust-tier fixture matrix (run in staging):
  - `local` tier: allows `*.local`, denies none.
  - `partner` tier: allows `*.local` + `partner.example`, denies none.
  - `restricted` tier: allows `*.local`, denies `*`.
- Announcement fanout policy fixture matrix:
  - role gating (`announcer`/`moderator` allowed, others rejected).
  - delayed fanout bounds validation (`delay_ms` inside/outside policy window).
- Runtime fixture references:
  - `blackout_runtime_tests/test_module_integration.py::test_federation_acl_template_compatibility_fixture`
  - `blackout_runtime_tests/test_module_integration.py::test_announcement_fanout_role_and_delay_policy_gating`
