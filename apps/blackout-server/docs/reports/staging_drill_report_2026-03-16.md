# Staging Quarantine + Rollback Drill Report

Date: 2026-03-16
Environment: `hs-alpha`, `hs-beta`, `hs-chaos`
Owner: SRE/Operations Lead

## Drill objectives

1. Exercise quarantine path for announcement policy/federation anomaly.
2. Exercise rollback path to baseline announcement fanout policy.
3. Verify federation stability and policy-leak containment post-rollback.

## Scenario summary

- Injected simulation condition in staging: delayed fanout policy out-of-bounds event attempts + unauthorized sender role attempts.
- Applied quarantine controls on affected path using restricted ACL posture.
- Executed rollback procedure from `docs/ops/announcement_fanout_rollback.md`.

## Observations

- Unauthorized sender-role attempts were rejected after policy gate enforcement.
- Delayed fanout out-of-bounds attempts were blocked by policy bounds checks.
- Federation transaction health stabilized after quarantine + rollback sequence.

## Timeline (UTC)

- 14:05 — Drill started, incident simulation enabled.
- 14:11 — Quarantine controls activated.
- 14:19 — Announcement policy reverted to immediate fanout baseline.
- 14:27 — Federation health checks returned to baseline window.
- 14:36 — Drill closed with owner sign-off.

## Exit assessment

- Quarantine execution within target response window: PASS
- Rollback execution without additional policy leak: PASS
- Recovery to baseline federation behavior: PASS

## Sign-off

- Federation Lead: Approved
- SRE/Operations Lead: Approved
- Security Lead: Approved
