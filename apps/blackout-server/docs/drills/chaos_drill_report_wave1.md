# Chaos drill report — wave 1

## 1) Purpose / scope
Validate service resilience and operator response for node-loss and worker-loss conditions, including alerting and recovery runbook execution.

## 2) Execution date / environment
- Date: 2026-03-04
- Environment: staging (`blackout-stg-eu1`)
- Incident record: `INC-STG-2026-03-04-CHAOS-01`

## 3) Exact command / procedure executed
1. Trigger worker disruption:
   ```bash
   kubectl -n blackout-staging scale deploy/synapse-federation-sender --replicas=0
   sleep 180
   kubectl -n blackout-staging scale deploy/synapse-federation-sender --replicas=2
   ```
2. Trigger node disruption (single app node drain):
   ```bash
   kubectl drain ip-10-0-12-34 --ignore-daemonsets --delete-emptydir-data --force
   sleep 120
   kubectl uncordon ip-10-0-12-34
   ```
3. Validate service health and backlog recovery:
   ```bash
   kubectl -n blackout-staging exec deploy/synapse-main -- curl -sf http://127.0.0.1:8008/health
   kubectl -n blackout-staging logs deploy/synapse-main --since=15m | rg -n "federation|backlog|retry"
   ```

## 4) Observed results and pass/fail criteria
- Observed:
  - alert fired within 2 minutes for sender unavailability.
  - service health endpoint remained available during node drain.
  - federation sender queue recovered to steady state after scale restore.
- Pass criteria:
  - detection time <= 5 minutes
  - core API health remains available throughout test window
  - backlog drain completes within 15 minutes after restoration
- Outcome: **PASS**

## 5) Follow-up actions (owner + due date)
- Add synthetic federation queue depth alert for earlier warning.
  - Owner: SRE Lead
  - Due: 2026-03-14
- Add scripted rollback helper for sender deployment scaling incidents.
  - Owner: Incident Commander Lead
  - Due: 2026-03-16
