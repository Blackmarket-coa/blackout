# Railway deployment

This repository includes Railway-ready configuration files:

- `railway.json`
- `nixpacks.toml`
- `scripts-dev/railway/start.sh`

## Required environment variables

- `SYNAPSE_SERVER_NAME` (recommended): Matrix server name for generated config.

## Optional environment variables

- `PORT` (provided by Railway): listener port, defaults to `8008`.
- `SYNAPSE_DATA_DIR`: where generated runtime files/config are stored (default `/data`).
- `SYNAPSE_CONFIG_PATH`: explicit homeserver config path.
- `SYNAPSE_LOG_CONFIG_PATH`: explicit log config path.
- `SYNAPSE_REPORT_STATS`: passed to initial config generation (`yes` / `no`, default `no`).
- `SYNAPSE_PUBLIC_BASEURL`: sets `public_baseurl` in generated config when provided.

## Behavior

On first boot, `scripts-dev/railway/start.sh` generates `homeserver.yaml` if missing,
patches the first listener to bind on `0.0.0.0:$PORT`, then starts Synapse.
Subsequent boots reuse the existing config.
