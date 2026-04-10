# Managed-hosting readiness and operator controls

This runbook covers readiness checks, verification hooks, and deployment profile guidance
for managed Blackout/Synapse hosting (Railway and generic containers).

## Deployment profile guidance

| Platform | Recommended `BLACKOUT_PROFILE` | Notes |
|---|---|---|
| Railway managed Postgres + Redis | `managed` | Enables dependency readiness checks and fail-fast diagnostics. |
| Generic container with external Postgres + Redis | `managed` | Same as Railway; configure dependency host/ports explicitly. |
| Single-container local/dev | `standalone` | SQLite fallback, redis disabled. |
| Low-resource single node | `constrained` | Same as standalone + conservative cache/presence/upload defaults. |

## Managed readiness checks

When `BLACKOUT_PROFILE=managed`, startup runs:

1. `python -m synapse.util.managed_hosting readiness`
2. `python -m synapse.util.managed_hosting run-hooks`

Readiness checks verify TCP connectivity to:

* Postgres (`DATABASE_HOST`, `DATABASE_PORT`, default `5432`)
* Redis (`REDIS_HOST`, `REDIS_PORT`, default `6379`)

### Operator controls

* `BLACKOUT_MANAGED_READINESS_CHECKS=true|false` (default `true`)
* `BLACKOUT_READINESS_RETRIES` (default `10`)
* `BLACKOUT_READINESS_TIMEOUT_SEC` (default `5`)
* `BLACKOUT_READINESS_DELAY_SEC` (default `1`)

These controls make the behavior reversible via configuration/env only.

## Backup/restore verification hooks

Optional startup hooks:

* `BLACKOUT_BACKUP_VERIFY_HOOK="<command>"`
* `BLACKOUT_RESTORE_VERIFY_HOOK="<command>"`

Fail policy controls:

* `BLACKOUT_BACKUP_HOOK_REQUIRED=true|false` (default `false`)
* `BLACKOUT_RESTORE_HOOK_REQUIRED=true|false` (default `false`)

If a hook is required and fails, startup exits non-zero with diagnostics.
If non-required, startup continues and logs a warning.

## Health endpoint checks

Post-start health verification can be executed with:

```bash
python -m synapse.util.managed_hosting health --url http://127.0.0.1:8008/health
```

## Failure alert guidance

Alert classes:

1. **Readiness failure at startup** (dependency unreachable)
   * Trigger: readiness command exits non-zero.
   * Action: page on-call platform + service owner.

2. **Required backup/restore hook failure**
   * Trigger: run-hooks command exits non-zero with required hook flags.
   * Action: page on-call, block rollout, investigate backup integrity immediately.

3. **Health endpoint failure post-start**
   * Trigger: health check command exits non-zero.
   * Action: fail deployment health gate and escalate to application on-call.

## Smoke scripts

Use:

```bash
scripts-dev/blackout/managed_hosting_smoke.sh
```

This script demonstrates:

* fail-fast readiness diagnostics
* health endpoint verification
