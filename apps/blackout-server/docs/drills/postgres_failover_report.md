# PostgreSQL failover drill report

## 1) Purpose / scope
Validate controlled primary-to-standby failover for the homeserver PostgreSQL tier and confirm application write/read continuity with bounded recovery time.

## 2) Execution date / environment
- Date: 2026-03-02
- Environment: staging (`blackout-stg-eu1`)
- Participants: SRE Lead, Database Reliability Lead, Release Engineering Lead

## 3) Exact command / procedure executed
1. Confirm replication health before failover:
   ```bash
   kubectl -n blackout-staging exec sts/postgres-primary -- psql -U synapse -d synapse -c "SELECT application_name, state, sync_state FROM pg_stat_replication;"
   ```
2. Trigger controlled failover to standby:
   ```bash
   kubectl -n blackout-staging exec sts/postgres-standby-0 -- patronictl -c /etc/patroni/config.yml failover --candidate postgres-standby-0 --force
   ```
3. Validate new primary role and write-path viability:
   ```bash
   kubectl -n blackout-staging exec sts/postgres-standby-0 -- psql -U synapse -d synapse -c "CREATE TABLE IF NOT EXISTS drill_failover_probe(ts timestamptz); INSERT INTO drill_failover_probe VALUES (now()); SELECT count(*) FROM drill_failover_probe;"
   ```
4. Validate app readiness after failover:
   ```bash
   kubectl -n blackout-staging exec deploy/synapse-main -- curl -sf http://127.0.0.1:8008/health
   ```

## 4) Observed results and pass/fail criteria
- Observed: failover completed in 62s, replication resumed, probe write succeeded, `/health` returned `OK`.
- Pass criteria:
  - promotion < 180s
  - no unrecoverable write errors in Synapse logs during failover window
  - post-failover health endpoint returns success
- Outcome: **PASS**

## 5) Follow-up actions (owner + due date)
- Tune Patroni alert threshold for replication lag spike sensitivity.
  - Owner: Database Reliability Lead
  - Due: 2026-03-12
- Add automatic canary write/read probe to failover runbook automation.
  - Owner: SRE Lead
  - Due: 2026-03-15
