# Mautrix Discord bridge operator runbook

This runbook covers the deployable `mautrix-discord` reference profile in `docker-compose.yml`.

## 1) Configure secrets and env

Set these required values in `.env` (see `.env.example`):

- `MAUTRIX_DISCORD_AS_TOKEN`
- `MAUTRIX_DISCORD_HS_TOKEN`
- `MAUTRIX_DISCORD_DISCORD_TOKEN`
- `MAUTRIX_DISCORD_PROVISIONING_SHARED_SECRET`
- `MAUTRIX_DISCORD_POSTGRES_PASSWORD`

## 2) Start bridge profile

From `deploy/docker/blackout-backend/`:

```bash
docker compose --profile integrations up -d mautrix-discord-db mautrix-discord
```

The bridge startup command renders and persists:

- `integrations/mautrix-discord/config.yaml`
- `integrations/mautrix-discord/registration.yaml`
- `/data/config.yaml`
- `/data/registration.yaml`

## 3) Load appservice into Synapse

Ensure Synapse has this registration path in `synapse/homeserver.yaml.template`:

- `/integrations/mautrix-discord/registration.yaml`

Then restart Synapse:

```bash
docker compose up -d synapse
```

## 4) Health checks

### Container health

```bash
docker compose ps mautrix-discord-db mautrix-discord
```

Expected:

- `mautrix-discord-db` is `healthy` via `pg_isready`
- `mautrix-discord` is `healthy` via `wget http://127.0.0.1:${MAUTRIX_DISCORD_METRICS_PORT}/metrics`

### Functional check

1. Invite `@${MAUTRIX_DISCORD_BOT_USERNAME}:${MATRIX_SERVER_NAME}` into a test Matrix room.
2. Run a bridge command with prefix `${MAUTRIX_DISCORD_COMMAND_PREFIX}` (e.g., link/login flow).
3. Confirm message relay Matrix ⇄ Discord and inspect logs:

```bash
docker compose logs --tail=200 mautrix-discord
```

## 5) Backup and restore

Bridge state is persisted in:

- Postgres volume: `mautrix_discord_db_data`
- Bridge data volume: `mautrix_discord_data`

Minimum policy:

- Daily encrypted Postgres backup.
- Weekly test restore into non-prod.

## 6) Incident response

### Credential leak or suspected compromise

1. Stop bridge:

```bash
docker compose --profile integrations stop mautrix-discord
```

2. Rotate:
   - Discord bot token
   - `MAUTRIX_DISCORD_AS_TOKEN`
   - `MAUTRIX_DISCORD_HS_TOKEN`
   - `MAUTRIX_DISCORD_PROVISIONING_SHARED_SECRET`
3. Restart bridge, then Synapse:

```bash
docker compose --profile integrations up -d mautrix-discord
docker compose up -d synapse
```

4. Validate health and end-to-end message flow before declaring recovery complete.
