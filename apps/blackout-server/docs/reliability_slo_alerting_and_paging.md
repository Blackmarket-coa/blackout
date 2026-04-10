# Reliability SLO alert thresholds and paging policy

_Date: 2026-02-20_
_Owner: SRE Lead_

This policy turns SLO definitions into actionable alerts and on-call response
rules.

## 1) Alert severity model

- **Warning:** early burn or trend risk; no immediate pager, triage during business hours.
- **Critical:** objective likely to breach without intervention; page primary on-call.
- **Emergency:** confirmed or imminent user-impacting SLO breach; page primary + incident commander.

## 2) Availability SLO thresholds

- **Warning** when 1h error-budget burn rate > 2x.
- **Critical** when 6h burn rate > 4x or 30m availability < 99.90%.
- **Emergency** when 15m availability < 99.50%.

### Routing

- Warning -> `#synapse-reliability` Slack channel + ticket.
- Critical -> PagerDuty service `synapse-api-primary`.
- Emergency -> PagerDuty service `synapse-major-incident` + auto-incident channel.

## 3) Federation recovery thresholds

- **Warning** when backlog exceeds baseline by 25% for 5 minutes.
- **Critical** when backlog exceeds baseline by 50% for 10 minutes.
- **Emergency** when recovery window misses 15-minute objective (result=`missed`).

### Routing

- Warning -> SRE triage queue.
- Critical -> PagerDuty service `synapse-federation-oncall`.
- Emergency -> `synapse-major-incident` with federation lead as required responder.

## 4) Durability/DR thresholds

- **Warning** when RPO lag > 30 seconds for 3 minutes.
- **Critical** when RPO lag > 60 seconds for 2 minutes.
- **Emergency** when RTO exceeds 5 minutes during failover or failover result=`failed`.

### Routing

- Warning -> DB reliability queue.
- Critical -> PagerDuty service `synapse-db-oncall`.
- Emergency -> Page DB + incident commander simultaneously.

## 5) Paging policy and escalation

- Primary responder acknowledgement SLA: 5 minutes.
- Secondary escalation at +10 minutes without acknowledgement.
- Incident commander auto-paged at +15 minutes for unresolved critical/emergency alerts.
- Error-budget policy: freeze non-critical releases if monthly burn > 50%.

## 6) Change-management requirements (C3)

- [x] Every SLO has warning/critical/emergency thresholds.
- [x] Every threshold maps to a paging destination.
- [x] Acknowledgement and escalation timers are explicit.
- [x] Release-freeze trigger tied to error-budget consumption.
