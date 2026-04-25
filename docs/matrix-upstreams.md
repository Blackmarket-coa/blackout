# Matrix upstream dependency registry

This document tracks the upstream repositories Blackout depends on or aligns with for Matrix-compatible delivery.

_Last reviewed: 2026-04-25._

> **2026-04-25 update — Matrix ecosystem expansion:**
> Adopted Pantalaimon (closes the Draupnir wiring gap), matrix-media-repo,
> synapse-admin, rageshake, matrix-registration, maubot, matrix-dimension,
> mautrix-{telegram,signal,whatsapp,slack,googlechat}, and
> matrix-appservice-irc. Added conduwuit and dendrite as alternative
> homeserver compose profiles (Monitor). All wiring lives under
> `deploy/docker/blackout-backend/` with the existing envsubst template
> pattern; client-side wiring (rageshake / dimension URLs) lives in
> `apps/blackout-client/config.json`.

## Backend core

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/element-hq/synapse | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/synapse/homeserver.yaml.template`, `apps/blackout-server/synapse/*` | Backend Platform | Adopt now |
| https://github.com/element-hq/matrix-authentication-service | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/mas/config.yaml.template`, `deploy/docker/blackout-backend/nginx/nginx.conf` | Identity & Access | Adopt now |
| https://github.com/matrix-org/sygnal | archived | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/sygnal/sygnal.yaml` | Messaging Infrastructure | Monitor |
| https://github.com/livekit/livekit | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/livekit/config.yaml`, `apps/blackout-client/src/app/features/calls/*` | Realtime Platform | Adopt now |
| https://github.com/girlbossceo/conduwuit | active | `deploy/docker/blackout-backend/docker-compose.yml` (`alt-homeserver-conduwuit` profile), `deploy/docker/blackout-backend/conduwuit/conduwuit.toml.template` | Backend Platform | Monitor |
| https://github.com/element-hq/dendrite | active | `deploy/docker/blackout-backend/docker-compose.yml` (`alt-homeserver-dendrite` profile), `deploy/docker/blackout-backend/dendrite/dendrite.yaml.template` | Backend Platform | Monitor |

## Client core

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/element-hq/element-web | active | `_port/*`, `apps/blackout-client/*`, `apps/blackout-web/*` | Client Platform | Adopt now |
| https://github.com/matrix-org/matrix-react-sdk | archived | `_port/src/*` (legacy imported surface), `apps/blackout-client/src/app/plugins/*` | Client Platform | Defer |

## Moderation

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/the-draupnir-project/Draupnir | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/draupnir/*`, `apps/blackout-client/src/app/features/moderation/*` | Trust & Safety Engineering | Adopt now |
| https://github.com/matrix-org/pantalaimon | active | `deploy/docker/blackout-backend/docker-compose.yml` (`pantalaimon` profile), `deploy/docker/blackout-backend/pantalaimon/pantalaimon.conf.template` | Trust & Safety Engineering | Adopt now |

## Media & operator tooling

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/turt2live/matrix-media-repo | active | `deploy/docker/blackout-backend/docker-compose.yml` (`media-repo` profile), `deploy/docker/blackout-backend/matrix-media-repo/config.yaml.template`, `deploy/docker/blackout-backend/nginx/nginx.conf` | Backend Platform | Adopt now |
| https://github.com/etkecc/synapse-admin | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/nginx/nginx.conf` (`/admin/`) | Backend Platform | Adopt now |
| https://github.com/matrix-org/rageshake | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/rageshake/rageshake.yaml.template`, `apps/blackout-client/config.json`, `apps/blackout-client/src/app/hooks/useClientConfig.ts` (`bugReportEndpointUrl`) | Client Platform | Adopt now |
| https://github.com/zeratax/matrix-registration | active | `deploy/docker/blackout-backend/docker-compose.yml` (`registration` profile), `deploy/docker/blackout-backend/matrix-registration/config.yaml.template`, `deploy/docker/blackout-backend/nginx/nginx.conf` (`/register/`) | Identity & Access | Adopt now |
| https://github.com/maubot/maubot | active | `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile), `deploy/docker/blackout-backend/maubot/config.yaml.template`, `deploy/docker/blackout-backend/nginx/nginx.conf` (`/_matrix/maubot/`) | Integrations Team | Adopt now |
| https://github.com/turt2live/matrix-dimension | active | `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile), `deploy/docker/blackout-backend/dimension/config.yaml.template`, `deploy/docker/blackout-backend/nginx/nginx.conf` (`/dimension/`), `apps/blackout-client/config.json` (`integrationsUrl`/`integrationsUiUrl`), `apps/blackout-client/src/app/hooks/useClientConfig.ts` | Integrations Team | Adopt now |

## Bridges/integrations

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/matrix-org/matrix-hookshot | active | `deploy/docker/blackout-backend/integrations/*`, `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile) | Integrations Team | Adopt now |
| https://github.com/matrix-org/matrix-appservice-bridge | active | `apps/blackout-server/services/*`, `apps/deaddrop-appservice/*`, `deploy/docker/blackout-backend/synapse/homeserver.yaml.template` (`app_service_config_files`) | Integrations Team | Monitor |
| https://github.com/mautrix/discord | active | `apps/blackout-server/services/bridges/*`, `deploy/docker/blackout-backend/integrations/*` | Integrations Team | Adopt now |
| https://github.com/mautrix/telegram | active | `deploy/docker/blackout-backend/integrations/mautrix-telegram/*`, `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile) | Integrations Team | Adopt now |
| https://github.com/mautrix/signal | active | `deploy/docker/blackout-backend/integrations/mautrix-signal/*`, `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile) | Integrations Team | Adopt now |
| https://github.com/mautrix/whatsapp | active | `deploy/docker/blackout-backend/integrations/mautrix-whatsapp/*`, `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile) | Integrations Team | Adopt now |
| https://github.com/mautrix/slack | active | `deploy/docker/blackout-backend/integrations/mautrix-slack/*`, `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile) | Integrations Team | Adopt now |
| https://github.com/mautrix/googlechat | active | `deploy/docker/blackout-backend/integrations/mautrix-googlechat/*`, `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile) | Integrations Team | Adopt now |
| https://github.com/matrix-org/matrix-appservice-irc | active | `deploy/docker/blackout-backend/integrations/matrix-appservice-irc/*`, `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile) | Integrations Team | Adopt now |

## Compliance/spec

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/matrix-org/matrix-spec | active | `docs/api/*`, `docs/features/frontend-backend-contract.md`, `apps/blackout-server/docs/*` | Standards & Compliance | Adopt now |
| https://github.com/matrix-org/matrix-spec-proposals | active | `docs/oidc.md`, `docs/e2ee.md`, `deploy/docker/blackout-backend/README.md` (MSC3861 references) | Standards & Compliance | Monitor |

## Notes

- Status values are sourced from GitHub repository metadata (`archived` flag).
- Decisions reflect current Blackout roadmap posture:
  - **Adopt now** = implemented and supported in the current release path.
  - **Monitor** = in active watchlist, version and risk reviewed regularly.
  - **Defer** = known option but not on the near-term implementation path.
