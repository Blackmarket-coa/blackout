# Game Day Exercise Log

## 2026-02-18 — Full-region resilience game day

- **Scenario:** worker crash, DB primary failover, federation egress interruption.
- **Results:** automatic worker recovery passed; failover stayed within RPO objective; federation backlog drained within RTO objective.
- **Actions:** tighten retry saturation alert threshold and add quarterly replay automation.

## 2026-02-19 — Backup + PITR restore drill

- **Scenario:** restore latest base backup and replay WAL to target timestamp.
- **Results:** restore completed successfully and consistency checks passed.
- **Actions:** keep daily verification artifact in CI workflow.


## 2026-02-20 — Full-region resilience game day (repeat)

- **Scenario:** repeat of worker crash + DB failover + federation egress interruption under higher synthetic load.
- **Results:** automatic worker recovery passed; DB failover remained within RPO objective; federation throughput returned within RTO/SLO envelope.
- **Actions:** no blocker findings; keep quarterly rehearsal cadence.
