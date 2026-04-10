# Cross-operator federation drill report

## 1) Purpose / scope
Validate inter-operator federation behavior during partition and recovery, including message catch-up, auth checks, and operational coordination.

## 2) Execution date / environment
- Date: 2026-03-06
- Environment: staging federation between `blackout-stg-a` and `blackout-stg-b`
- Participants: Federation Architecture Lead, Incident Commander Lead, partner operator representative

## 3) Exact command / procedure executed
1. Baseline federation health from operator A:
   ```bash
   python scripts-dev/federation_client.py --server https://stg-a.blackout.example --destination stg-b.blackout.example --action ping
   ```
2. Simulate controlled federation partition (egress block) for 10 minutes:
   ```bash
   kubectl -n blackout-staging-a exec deploy/egress-gateway -- iptables -A OUTPUT -d stg-b.blackout.example -j DROP
   sleep 600
   kubectl -n blackout-staging-a exec deploy/egress-gateway -- iptables -D OUTPUT -d stg-b.blackout.example -j DROP
   ```
3. Verify backlog recovery and event consistency after link restore:
   ```bash
   python scripts-dev/federation_client.py --server https://stg-a.blackout.example --destination stg-b.blackout.example --action smoke
   python scripts-dev/federation_client.py --server https://stg-b.blackout.example --destination stg-a.blackout.example --action smoke
   ```
4. Confirm no sustained federation error loop in logs:
   ```bash
   kubectl -n blackout-staging-a logs deploy/synapse-federation-sender --since=20m | rg -n "ERROR|retry"
   kubectl -n blackout-staging-b logs deploy/synapse-federation-sender --since=20m | rg -n "ERROR|retry"
   ```

## 4) Observed results and pass/fail criteria
- Observed:
  - partition detected and alerts fired.
  - post-restore federation resumed automatically.
  - smoke probes succeeded both directions.
- Pass criteria:
  - detection <= 5 minutes
  - backlog recovery <= 20 minutes post-restore
  - no unresolved auth-chain divergence after recovery checks
- Outcome: **PASS**

## 5) Follow-up actions (owner + due date)
- Add reusable partition simulation helper script for future drills.
  - Owner: Federation Architecture Lead
  - Due: 2026-03-21
- Add cross-operator incident bridge checklist into ops runbook.
  - Owner: Incident Commander Lead
  - Due: 2026-03-21
