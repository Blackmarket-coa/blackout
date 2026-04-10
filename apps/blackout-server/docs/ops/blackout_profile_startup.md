# BLACKOUT_PROFILE startup behavior

`BLACKOUT_PROFILE` controls deterministic startup configuration selection for `blackout-server`.

## Decision table

| Input | Dependency check | Selected profile | Startup behavior |
|---|---|---|---|
| `BLACKOUT_PROFILE=managed` | Required (`DATABASE_HOST`, `DATABASE_PASSWORD`, `REDIS_HOST`, `REGISTRATION_SHARED_SECRET`) | `managed` | Uses templated Postgres+Redis config. Fails fast with actionable errors if dependencies are missing. |
| `BLACKOUT_PROFILE=standalone` | Not required | `standalone` | Generates SQLite config, disables Redis, and enforces healthcheck-compatible listener settings (`client`, `federation`, `health`) on the configured port. |
| `BLACKOUT_PROFILE=constrained` | Not required | `constrained` | Same as standalone, plus conservative low-resource tuning (`caches.global_factor=0.1`, `presence.enabled=false`, `max_upload_size=10M`). |
| unset | Auto-detect managed deps | `managed` if all required vars exist; otherwise `standalone` | Deterministic auto mode with startup logging of selected profile and reason. |

## Startup logging

Entrypoint logs a deterministic line at startup:

```text
[entrypoint] startup profile=<profile> reason=<reason> server_name=<name> port=<port>
```

## Protocol compatibility

Profile handling only affects local process startup and generated listener/runtime settings.
Matrix protocol endpoints remain compatible, including `/_matrix/client/versions`.

## Operational notes

* Managed profile is recommended for production deployments with Postgres + Redis.
* Standalone/constrained profiles are intended for local/single-node operation.
* Existing `homeserver.yaml` is left unchanged; profile logic applies when generating a new config.
