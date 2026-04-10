# Backup and DR operations

This page defines the operational implementation for tracker items E1-E4.

## E1. Daily full + incremental/WAL backups operational

### Backup schedule

- Daily full base backup at `02:00 UTC` with `scripts-dev/blackout/backup_run.sh`.
- Continuous WAL archiving enabled in PostgreSQL config:

```conf
archive_mode = on
archive_command = 'test ! -f /var/backups/postgres/wal/%f && cp %p /var/backups/postgres/wal/%f'
archive_timeout = 60
```

### Example systemd timer wiring

```ini
# /etc/systemd/system/blackout-pg-backup.service
[Unit]
Description=Blackout Postgres full backup

[Service]
Type=oneshot
Environment=BACKUP_ROOT=/var/backups/postgres
ExecStart=/path/to/repo/scripts-dev/blackout/backup_run.sh
```

```ini
# /etc/systemd/system/blackout-pg-backup.timer
[Unit]
Description=Daily Blackout Postgres full backup

[Timer]
OnCalendar=*-*-* 02:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

## E2. Automated backup verification pipeline implemented

Run `scripts-dev/blackout/backup_verify.sh` after each backup (or at least daily).

The verifier checks:

1. latest base backup exists,
2. backup files pass `pg_verifybackup`,
3. backup manifest exists,
4. WAL archive path exists and is non-empty.

Verification reports are written under `${BACKUP_ROOT}/verification-reports`.

## E3. Quarterly restore drill passing

Run `scripts-dev/blackout/quarterly_restore_drill.sh` every quarter in staging
(or an isolated DR environment with production-like PostgreSQL version).

Required pass criteria:

1. latest backup can be copied/restored to isolated storage,
2. `pg_controldata` succeeds on restored data directory,
3. restore-drill report is archived and linked in reliability evidence.

## E4. Replication/lag/capacity alerting implemented

Prometheus alerts are defined in `contrib/prometheus/blackout-dr.rules` for:

- replica replay lag,
- WAL receiver lag,
- disk capacity pressure,
- stale backup freshness,
- stale verification runs.

Wire the rules file in Prometheus:

```yaml
rule_files:
  - "/PATH/TO/contrib/prometheus/synapse-v2.rules"
  - "/PATH/TO/contrib/prometheus/blackout-dr.rules"
```
