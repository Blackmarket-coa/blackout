# Railway Deployment Hardening Guide

> **2026-11-02.** The fork's Railway template (`railway.toml` and
> `services/blackout-server/`) was removed in `42f68f2`; the operator chose removal
> over fixing the template. No Railway deploy path for the Synapse homeserver
> remains in the tree, so this guide describes a deployment nothing here
> builds. It is kept as guidance.

## Worker split
Run dedicated Railway services for:
- main client reader
- federation sender
- synchrotron/client sync
- media repository worker

Use the same image and distinct `worker_app` settings per service.

## Media storage with MinIO
Configure Synapse S3-compatible storage provider targeting MinIO:
- set endpoint URL to your MinIO gateway/service
- set bucket + credentials from Railway variables
- keep `media_store_path` only as local spillover buffer

## PostgreSQL + PgBouncer
Recommended topology:
- Railway PostgreSQL
- PgBouncer sidecar/service
- Synapse `database.args` points to PgBouncer host/port

Tune pool settings for worker count and burst behavior.

## Metrics and health
- enable Prometheus metrics endpoint from Synapse
- scrape metrics from monitoring stack
- wire Railway health checks to a lightweight client path (`/_matrix/client/versions`) and internal process liveness

## Blackout runtime module config
```yaml
modules:
  - module: blackout_runtime.module.BlackoutRuntimeModule
    config:
      persistence_path: /data/blackout_runtime.sqlite3
      proposal_rate_limit: 10
      proposal_rate_window_s: 3600
      attestation_cooldown_s: 300
```

## Operational cadence
- Monthly upstream sync rehearsal/merge and post-merge regression suite
- Immediate security merge on Synapse advisory publication
- Keep non-`blackout_runtime` deltas tracked in `PATCHES.md`
