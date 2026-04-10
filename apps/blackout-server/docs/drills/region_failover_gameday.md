# Region failover game-day report

## 1) Purpose / scope
Demonstrate regional failover readiness for ingress + application tier and verify RTO/RPO commitments for deployment gate G3.

## 2) Execution date / environment
- Date: 2026-03-05
- Environment: staging multi-region (`eu-west` primary, `us-east` standby)
- Owners: SRE Lead, Release Engineering Lead

## 3) Exact command / procedure executed
1. Freeze new rollouts and capture baseline:
   ```bash
   kubectl config use-context blackout-stg-eu-west
   kubectl -n blackout-staging get deploy,sts
   ```
2. Shift ingress traffic from primary region to standby region:
   ```bash
   terraform -chdir=infra/staging apply -target=module.global_lb -var='active_region=us-east'
   ```
3. Validate client-facing health and API reachability:
   ```bash
   curl -sf https://staging.blackout.example/_matrix/client/versions
   curl -sf https://staging.blackout.example/health
   ```
4. Validate event write/read after failover:
   ```bash
   python scripts-dev/federation_client.py --server https://staging.blackout.example --action smoke
   ```

## 4) Observed results and pass/fail criteria
- Observed:
  - traffic cutover completed in 4m20s.
  - endpoints remained reachable post-cutover.
  - smoke send/read checks completed successfully.
- Pass criteria:
  - RTO <= 10 minutes
  - RPO <= 1 minute for event persistence envelope metadata
  - no sustained 5xx above 1% for 15-minute window
- Outcome: **PASS**

## 5) Follow-up actions (owner + due date)
- Add DNS TTL sanity check step before regional switch.
  - Owner: SRE Lead
  - Due: 2026-03-17
- Add explicit federation smoke rollback step to game-day runbook.
  - Owner: Federation Architecture Lead
  - Due: 2026-03-19
