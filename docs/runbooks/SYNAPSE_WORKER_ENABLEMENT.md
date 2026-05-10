# Synapse Worker-Mode Enablement Runbook

Foundation milestone deliverable per
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §9.2](../AGGRESSIVE_OPERATIONS_GUIDE.md):
"Synapse worker-mode config (documented, not enabled)". This runbook
covers when to enable Synapse workers, how to enable them, and how to
roll back. It does not cover the upstream worker concept itself; for
that, see
[the upstream Synapse workers reference](https://element-hq.github.io/synapse/latest/workers.html).

The configurations themselves are pre-staged at
[`../../infra/single-server-baseline/synapse/workers/`](../../infra/single-server-baseline/synapse/workers/)
and the stanzas that enable them in the main process live commented-out
at the bottom of
[`../../infra/single-server-baseline/synapse/homeserver.yaml.template`](../../infra/single-server-baseline/synapse/homeserver.yaml.template).
This runbook is what binds those artifacts to a decision.

## When to enable

Do not enable workers until at least one of the following triggers fires
on the [`synapse_capacity` dashboard](../operations/dashboards/synapse_capacity_dashboard.json):

| Trigger | What it tells you | Worker(s) to enable |
|---------|-------------------|---------------------|
| Federation outbound queue (PDUs or EDUs) sustained above ~1000 for >30 minutes | Federation sending is the bottleneck; the main process is rate-limited by send concurrency | `federation_sender` |
| Main Synapse HTTP p95 above 1s sustained, or main Synapse CPU above 80% sustained | Client API traffic is starving everything else | `generic_worker` (+ `background_worker` to follow) |
| Pusher delivery latency observable (room invites taking minutes to push) | Background tasks are starving on the main loop | `background_worker` |
| Postgres autovacuum on Synapse state tables falling behind (n_dead_tup growth outpacing vacuum runs) | Symptom often shows up *as* worker-needed pressure even though the underlying issue is Postgres | Tune Postgres first per [`../../infra/single-server-baseline/postgres/postgresql.conf`](../../infra/single-server-baseline/postgres/postgresql.conf); workers do not fix vacuum starvation |

The §4.1 of the guide is explicit that capacity bands cannot be set
without telemetry. Treat the thresholds above as starting points; revise
them after the dashboard has been live for at least a quarter of a
milestone.

## Pre-requisites

- [ ] [`infra/single-server-baseline/synapse/homeserver.yaml.template`](../../infra/single-server-baseline/synapse/homeserver.yaml.template)
      metrics listener is live and Prometheus is scraping it
      (Foundation milestone Synapse capacity telemetry deliverable).
- [ ] [`docs/operations/dashboards/synapse_capacity_dashboard.json`](../operations/dashboards/synapse_capacity_dashboard.json)
      is loaded into Grafana and panels are populating.
- [ ] Redis is running and reachable from Synapse — workers use Redis
      for replication transport. The single-server baseline already
      ships with Redis enabled.
- [ ] A bus-factor drill
      ([`../operations/BUS_FACTOR_DRILL_CADENCE.md`](../operations/BUS_FACTOR_DRILL_CADENCE.md))
      has covered Synapse restart in worker-less mode at least once,
      so the rollback path is exercised.

## Enablement procedure (federation_sender first)

The lowest-risk worker to enable first is the federation sender. It
does not serve client traffic; failure mode is "federation backlog
grows" rather than "users see errors."

### 1. Uncomment the worker stanzas in homeserver.yaml.template

In
[`../../infra/single-server-baseline/synapse/homeserver.yaml.template`](../../infra/single-server-baseline/synapse/homeserver.yaml.template),
remove the `#` from:

- the `listeners:` block that adds the replication listener on port 9093
- `instance_map.main`
- `federation_sender_instances`

Leave the rest commented. Re-render the template through `envsubst` to
produce `homeserver.yaml`.

### 2. Add the worker container to docker-compose.yml

Add a new service alongside `synapse:` in
[`../../infra/single-server-baseline/docker-compose.yml`](../../infra/single-server-baseline/docker-compose.yml):

```yaml
  synapse-federation-sender:
    image: matrixdotorg/synapse:v1.130.0
    container_name: blackout-synapse-fed-sender
    restart: unless-stopped
    user: "991:991"
    expose:
      - "9102"  # /_synapse/metrics
    environment:
      - SYNAPSE_WORKER=synapse.app.federation_sender
      - SYNAPSE_CONFIG_PATH=/data/homeserver.yaml
      - SYNAPSE_WORKER_CONFIG_PATH=/data/worker.yaml
    volumes:
      - ./synapse/homeserver.yaml:/data/homeserver.yaml:ro
      - ./synapse/workers/federation_sender.yaml:/data/worker.yaml:ro
      - synapse-data:/data
      - synapse-media:/media
    depends_on:
      synapse:
        condition: service_healthy
    networks:
      - app
      - data
    security_opt:
      - no-new-privileges:true
    <<: *common-logging
```

The image must match the main Synapse image version exactly, otherwise
replication-protocol mismatches surface as opaque restart loops.

### 3. Add the Prometheus scrape target

Append to
[`../../deploy/docker/production/monitoring/prometheus/prometheus.yml.example`](../../deploy/docker/production/monitoring/prometheus/prometheus.yml.example)
under the `synapse` job's `static_configs.targets`:

```yaml
          - synapse-federation-sender:9102
```

### 4. Restart the stack

```
docker compose up -d synapse synapse-federation-sender
```

Order matters: the main Synapse process must come up first because
the worker's replication client connects back to it on port 9093.

### 5. Validate

- [ ] `docker compose logs synapse-federation-sender` shows successful
      replication handshake (look for "Connected to replication") and
      no errors.
- [ ] The federation_sender's `/_synapse/metrics` is reachable from
      Prometheus: `curl synapse-federation-sender:9102/_synapse/metrics`
      returns Prometheus text format.
- [ ] On the [`synapse_capacity` dashboard](../operations/dashboards/synapse_capacity_dashboard.json),
      the federation outbound queue panel begins to drain.
- [ ] No new errors in the main Synapse log; the main process has
      relinquished its federation-sending role and the worker is
      handling it.

## Generic worker + background worker (do together)

Once the federation sender is stable, enable the generic and
background workers in the same window. They are paired because the
generic worker takes stream-writer roles and the background worker
takes the residual periodic tasks; enabling only one leaves an awkward
middle state where stream-writer roles are split from background work.

The procedure is the same as §1–§5 above, but uncomment additionally:

- `stream_writers` block
- `pusher_instances`
- `notify_appservices_from_worker`
- `update_user_directory_from_worker`

And add **two** services to docker-compose.yml using
[`generic_worker.yaml`](../../infra/single-server-baseline/synapse/workers/generic_worker.yaml)
and
[`background_worker.yaml`](../../infra/single-server-baseline/synapse/workers/background_worker.yaml).

The generic worker also requires nginx routing changes in
[`../../infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`](../../infra/single-server-baseline/nginx/sites-available/theblackout.app.conf):
client paths claimable by a generic worker (per the upstream worker
routing tables) should `proxy_pass` to `synapse-generic-worker:8009`
instead of the main `synapse:8008`. This is the highest-risk part of
the enablement; do it during a low-traffic window.

## Rollback

Rollback is the inverse of enablement and is non-destructive: workers
do not own state that the main process needs to read on rollback. They
relay state through Redis and back to the main process.

- [ ] Re-comment the worker stanzas in
      [`homeserver.yaml.template`](../../infra/single-server-baseline/synapse/homeserver.yaml.template)
      that you uncommented during enablement.
- [ ] Re-render the template through `envsubst`.
- [ ] Stop the worker services:
      ```
      docker compose stop synapse-federation-sender synapse-generic-worker synapse-background-worker
      ```
- [ ] Revert the nginx routing changes (if you made them for the
      generic worker) so all client traffic again goes to
      `synapse:8008`.
- [ ] Restart the main Synapse process so it re-claims the worker
      roles: `docker compose restart synapse`.
- [ ] Validate via the same dashboard panels: the main process should
      now own federation sending, stream-writer roles, and background
      tasks.

The worker container definitions and config files can be left in the
docker-compose.yml as `profiles: ["workers"]` services so they are
defined-but-not-started; that way the next enablement attempt does
not need to re-edit compose, only flip the profile.

## Cross-references

- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §4.1](../AGGRESSIVE_OPERATIONS_GUIDE.md) — capacity watch-items
- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §9.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — Foundation milestone tracker row
- [`../../infra/single-server-baseline/synapse/homeserver.yaml.template`](../../infra/single-server-baseline/synapse/homeserver.yaml.template) — main config with commented-in stanzas
- [`../../infra/single-server-baseline/synapse/workers/`](../../infra/single-server-baseline/synapse/workers/) — three worker config files
- [`../../infra/single-server-baseline/docker-compose.yml`](../../infra/single-server-baseline/docker-compose.yml) — where worker services are added
- [`../operations/dashboards/synapse_capacity_dashboard.json`](../operations/dashboards/synapse_capacity_dashboard.json) — trigger thresholds depend on these panels
- [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md) — row 4 (Synapse SPOF)
- [`../../infra/single-server-baseline/postgres/postgresql.conf`](../../infra/single-server-baseline/postgres/postgresql.conf) — vacuum tuning to consider before workers
- [Upstream Synapse workers reference](https://element-hq.github.io/synapse/latest/workers.html)
