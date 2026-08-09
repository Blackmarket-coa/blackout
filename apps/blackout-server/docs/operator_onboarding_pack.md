# Operator onboarding pack — homeserver validation record

> **This is a dated validation record, not the onboarding pack itself.** It
> captures a 2026-03-05 run proving the homeserver operator path works. The
> living pack operators should read is
> [`docs/operations/operator_onboarding_pack.md`](../../../docs/operations/operator_onboarding_pack.md)
> at the monorepo root; this file shares its name for historical reasons.
>
> Paths below are relative to `apps/blackout-server/`.

## 1) Purpose / scope

Provide a minimum complete onboarding path for community/operators running deployment, incident response, backup/restore verification, and federation troubleshooting.

## 2) Execution date / environment

- Date compiled: 2026-03-05
- Validation environment: staging + tabletop incident walkthrough
- Reviewers: Incident Commander Lead, SRE Lead

## 3) Exact command / procedure executed

### Onboarding validation runbook steps

1. Clone and bootstrap. _(As run in 2026-03: the homeserver was then a
   standalone `Blackout_server` repo. It now lives in this monorepo, so the
   equivalent today is:)_
   ```bash
   git clone https://github.com/Blackmarket-coa/blackout.git
   cd blackout/apps/blackout-server
   python -m venv .venv && . .venv/bin/activate
   pip install -e .
   ```
2. Verify runtime health checks documented for operators:
   ```bash
   rg -n "health|ready|liveness" docs synapse
   ```
3. Run backup/restore operator commands:
   ```bash
   BACKUP_ROOT=/var/backups/postgres scripts-dev/blackout/backup_run.sh
   BACKUP_ROOT=/var/backups/postgres REPORT_DIR=/var/backups/postgres/verification-reports scripts-dev/blackout/backup_verify.sh
   BACKUP_ROOT=/var/backups/postgres DRILL_ROOT=/var/tmp/postgres-restore-drill scripts-dev/blackout/quarterly_restore_drill.sh
   ```
4. Verify incident reference materials are available:
   ```bash
   test -f docs/blackout-ops-runbook.md
   test -f docs/incident_response_maturity.md
   test -f docs/backup_and_dr_operations.md
   ```

## 4) Observed results and pass/fail criteria

- Observed:
  - onboarding checklist completed by two operators with no blockers.
  - all required runbook docs and scripts were present and executable in staging context.
  - incident escalation flow was exercised in tabletop and accepted.
- Pass criteria:
  - new operator can complete setup + health + backup verification in <= 90 minutes
  - required runbooks reachable and internally consistent
  - incident escalation contacts and severity matrix acknowledged by operators
- Outcome: **PASS**

## 5) Follow-up actions (owner + due date)

- Add short video walkthrough link section and ownership roster updates.
  - Owner: Incident Commander Lead
  - Due: 2026-03-22
- Add federation troubleshooting quick-reference matrix for non-core operators.
  - Owner: Federation Architecture Lead
  - Due: 2026-03-25
