# Integrations profile assets

This folder stores integration bridge configuration used by the optional Docker Compose `integrations` profile.

## Included templates

- `hookshot/config.yml.template` – Matrix Hookshot runtime config template.
- `hookshot/registration.yml.template` – Hookshot appservice registration template consumed by Synapse.

## Rendering templates

From `deploy/docker/blackout-backend/`, render files after setting `.env` values:

```bash
docker compose --profile integrations run --rm matrix-hookshot true
```

The Hookshot service startup command renders:

- `integrations/hookshot/config.yml`
- `integrations/hookshot/registration.yml`

## Synapse registration path

Add the rendered registration file path to Synapse `app_service_config_files` in `synapse/homeserver.yaml.template`:

```yaml
app_service_config_files:
  - /integrations/hookshot/registration.yml
```

The `synapse` service mounts this folder read-only at `/integrations/hookshot`.
