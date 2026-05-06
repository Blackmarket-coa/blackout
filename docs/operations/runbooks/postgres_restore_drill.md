# PostgreSQL Restore Drill (PITR)

**Audience**: on-call SRE for the production Compose / Kubernetes deployment.
**Cadence**: drill at least monthly, attach evidence to the next
`docs/operations/evidence/` writeup. The CI workflow
`dr-backup-verification.yml` runs an automated subset nightly.

This runbook covers the **point-in-time recovery (PITR)** path: a fresh
PostgreSQL instance hydrated from the most recent base backup plus replayed
WAL. The Compose stack ships a `backup` service
(`deploy/docker/production/docker-compose.yml`) that writes daily logical
dumps; the production cluster also writes WAL to object storage via the
`pg-wal-archive` sidecar (declared in `deploy/kubernetes/phase4/`).

---

## RPO / RTO budgets

| Metric | Target | Source |
| --- | --- | --- |
| RPO (Recovery Point Objective) | ≤ 5 min | WAL archive cadence |
| RTO (Recovery Time Objective) | ≤ 60 min | Restore + reapply migrations + smoke |

If a drill exceeds either budget, file an incident and link it back here.

---

## Preconditions

1. You have access to the backup bucket (`s3://blackout-backups/<env>/...`)
   with a credential scoped to read-only.
2. A throwaway PostgreSQL 16 instance is available (kubectl access to the
   `restore-target` namespace, or a Compose host with port 5433 free).
3. You have a recent **manifest hash** noted from the production app
   (`SELECT manifest_hash FROM schema_migrations ORDER BY ordinal DESC LIMIT 1`);
   it is the canary value the restored DB must reproduce.

---

## Procedure

### 1. Pull artefacts

```bash
# Latest base backup
aws s3 cp s3://blackout-backups/$ENV/base/latest.tar.zst ./base.tar.zst

# WAL segments since base
aws s3 sync s3://blackout-backups/$ENV/wal/ ./wal/
```

### 2. Stand up the throwaway instance

```bash
docker run -d --name pg-restore -e POSTGRES_PASSWORD=restore -p 5433:5432 \
  -v "$PWD/datadir:/var/lib/postgresql/data" postgres:16-alpine
docker exec -it pg-restore bash
# inside the container:
pg_ctl stop -D /var/lib/postgresql/data
rm -rf /var/lib/postgresql/data/*
tar -I 'zstd -d' -xf /backups/base.tar.zst -C /var/lib/postgresql/data
cp -r /backups/wal /var/lib/postgresql/data/pg_wal/
```

### 3. Configure recovery target

Edit `postgresql.auto.conf`:

```conf
restore_command = 'cp /var/lib/postgresql/data/pg_wal/%f %p'
recovery_target_time = '2026-05-06 14:32:00 UTC'   # set to the drill point
recovery_target_action = 'promote'
```

Then `pg_ctl start -D /var/lib/postgresql/data`.

### 4. Verify integrity

Run from a shell with a `psql` client pointed at the restored instance:

```sql
-- Schema parity
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Migration manifest (must match production canary)
SELECT id, ordinal, applied_at FROM schema_migrations ORDER BY ordinal DESC LIMIT 5;

-- Row-count smoke
SELECT 'users'      AS table, count(*) FROM users
UNION ALL SELECT 'communities',     count(*) FROM communities
UNION ALL SELECT 'messages',        count(*) FROM messages
UNION ALL SELECT 'refresh_tokens',  count(*) FROM refresh_tokens
UNION ALL SELECT 'tips',            count(*) FROM tips;

-- Integrity: refresh tokens reference live users
SELECT count(*) AS orphaned_refresh
  FROM refresh_tokens r LEFT JOIN users u ON u.id = r.user_id
  WHERE u.id IS NULL;  -- expect 0

-- Money trail: tips reconcile to creator subscriptions
SELECT count(*) AS unreconciled_tips
  FROM tips WHERE captured_at IS NOT NULL AND captured_amount_cents IS NULL;
```

The last two queries must return **0** rows. Any non-zero result is a
restore-quality regression and must be filed.

### 5. Run the API against the restored DB (optional but encouraged)

```bash
DATABASE_URL=postgres://postgres:restore@127.0.0.1:5433/postgres \
JWT_SECRET_PRIMARY="<a strong drill secret>" \
NODE_ENV=production \
CORS_ALLOWED_ORIGINS=https://example.test \
REDIS_URL=redis://127.0.0.1:6379 \
pnpm --filter @blackout/api migrate:status

curl -fsS http://127.0.0.1:3000/health
```

`migrate:status` must report **0 pending** migrations. `/health` must return
`status: ok`.

### 6. Tear down

```bash
docker rm -f pg-restore
rm -rf datadir wal base.tar.zst
```

### 7. File evidence

Append to `docs/operations/evidence/YYYY-MM-DD-pitr-restore-drill.md`
including:

- Drill start / end timestamps (UTC).
- Recovery target time used.
- Query results (or attached `.txt`).
- Observed RTO and RPO; flag any that breached budget.
- Issues raised, with links.

---

## Automated nightly subset

`dr-backup-verification.yml` runs an automated version of steps 1, 2, 4
against staging. If it fails, page the on-call SRE; the failure mode is
almost always a missing WAL segment or a base backup that did not finalize.

## Troubleshooting

- **`FATAL: hot standby is not possible because parameter ... was set to a lower value on the master`**
  The base backup was taken with `wal_level < replica`. Reissue the base
  backup; do not attempt to fix in place.
- **`recovery_target_time` overshoot**
  Set `recovery_target_action = 'pause'` first, query
  `pg_last_xact_replay_timestamp()` to see how far you got, and adjust the
  target before promoting.
- **Migration drift**
  If `migrate:status` reports pending migrations, the staging code may be
  ahead of the restored DB. Run `pnpm --filter @blackout/api migrate:up` and
  re-verify. If the restore was supposed to match production *exactly*, this
  is a finding — capture it.
