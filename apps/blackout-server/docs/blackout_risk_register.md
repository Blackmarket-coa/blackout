# Blackout Risk Register

_Date: 2026-03-14_  
_Status: **Active and reviewed at each phase gate**

| Risk ID | Description | Severity | Owner | Mitigation | Current status |
|---|---|---|---|---|---|
| BR-01 | Cross-cell policy leakage due to misconfiguration | High | Policy Lead | Policy schemas + CI drift checks + trust-tier ACL defaults | Monitoring (no active leak incidents) |
| BR-02 | Dead-drop retention drift or purge scheduler failure | High | Operations Lead | TTL bounds, purge audits, rollback runbook, purge SLA alerting | Monitoring (SLA checks passing) |
| BR-03 | Announcement channel sender abuse | Medium | Security Lead | Sender-role allowlist enforcement + moderation controls + anomaly alerts | Monitoring |
| BR-04 | Timing-jitter / delayed fanout pilot latency impact | Medium | SRE Lead | Cohort-only rollout, SLO dashboards, auto rollback criteria | Experimental (contained in opt-in cohorts) |
| BR-05 | Federation instability on intermittent links | Medium | Federation Lead | Edge profile tuning + retry/backoff controls + staged federation rollout | Experimental (staging validated) |
| BR-06 | Server-side steganography scope creep | Low | Security Lead | Explicit no-tooling policy; maintain standards-compliant media pipeline only | Accepted constraint |

## Review cadence
- Reviewed in phase gate meetings.
- Any High-severity regression blocks gate progression until mitigated or formally accepted by Security + Operations.
