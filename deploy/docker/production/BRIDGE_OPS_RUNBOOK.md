# Bridge operations runbook

This runbook defines smoke checks, monitoring, and escalation policy for Matrix bridges operated from Docker production environments.

## Scope

Applies to appservice-based bridges used by Blackout production, including:

- `matrix-hookshot`
- `mautrix-discord`
- additional appservices adopting the same metric contract

## Health smoke gate

Use the smoke script before releases and during incident triage:

```bash
deploy/docker/production/scripts/bridge-health-smoke.sh
```

### What it validates

1. **Appservice registration loaded**
   - registration file exists on disk
   - registration file is mounted in Synapse
   - Synapse `homeserver.yaml` references the registration path
   - optional Synapse admin API confirmation (`SYNAPSE_ADMIN_URL` + `SYNAPSE_ADMIN_TOKEN`)
2. **Bridge container health**
   - bridge container is running
   - Docker healthcheck status is `healthy` (or warning if `ALLOW_MISSING_BRIDGE_HEALTHCHECK=1`)
3. **Deterministic synthetic probe**
   - default: bridge performs appservice-token `/account/whoami` call to Synapse
   - optional: custom message-flow command via `BRIDGE_MESSAGE_FLOW_CMD`

### Release gate integration

Enable this gate in release checks:

```bash
ENABLE_BRIDGE_HEALTH_GATE=1 deploy/docker/production/scripts/release-gate-checks.sh
```

## Monitoring artifacts

- Prometheus alert rules: `deploy/docker/production/monitoring/prometheus/bridge-alert-rules.yml`
- Grafana dashboard: `deploy/docker/production/monitoring/grafana/bridge-operations-dashboard.json`

## Alert thresholds

| Signal | Warning threshold | Critical threshold | Alert names |
|---|---:|---:|---|
| Message delivery failures | `rate(...) > 0.02/s` for 10m | `rate(...) > 0.2/s` for 5m | `BridgeMessageDeliveryFailuresHigh`, `BridgeMessageDeliveryFailuresCritical` |
| Auth/token failures | `rate(...) > 0.01/s` for 10m | (treat repeated warning + user impact as critical) | `BridgeAuthTokenFailuresHigh` |
| Queue/backlog lag | backlog `>250` for 10m | backlog `>1000` for 5m | `BridgeQueueLagWarning`, `BridgeQueueLagCritical` |
| Process/container availability | target down or unhealthy for 5m | same (always critical) | `BridgeContainerUnavailable`, `BridgeContainerUnhealthy` |

## Escalation policy

### Severity mapping

- **SEV-2 (warning):** warning alert sustained >10 minutes, no confirmed end-user outage.
- **SEV-1 (critical):** any critical bridge alert OR warning with confirmed delivery outage.

### On-call response targets

- **SEV-1:** acknowledge within 5 minutes, mitigation plan within 15 minutes.
- **SEV-2:** acknowledge within 15 minutes, mitigation plan within 60 minutes.

### Escalation path

1. Primary platform on-call investigates bridge + Synapse logs.
2. If unresolved after 15 minutes (SEV-1) or 60 minutes (SEV-2), page secondary on-call + incident commander.
3. If auth/token failures persist, involve security/identity owner for secret rotation approval.
4. If third-party API degradation is root cause, notify product/support and apply bridge throttling or temporary disablement.

## Standard triage checklist

1. Run `bridge-health-smoke.sh` and capture output in incident notes.
2. Check Grafana dashboard panels for failures/auth/backlog/availability trends.
3. Review bridge logs (`docker compose logs --tail=200 matrix-hookshot` etc.).
4. Validate appservice token and registration consistency.
5. If backlog is rising, apply rate controls and reduce non-critical bridge traffic.
6. Confirm recovery by observing metric return below warning thresholds for 30 minutes.

## Recovery and closure

Close incident only after all are true:

- smoke checks pass,
- no critical alerts firing for 30 minutes,
- warning alerts below threshold for 60 minutes,
- root cause and follow-up actions documented.
