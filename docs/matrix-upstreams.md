# Matrix upstream dependency registry

This document tracks the upstream repositories Blackout depends on or aligns with for Matrix-compatible delivery.

_Last reviewed: 2026-04-25._

## Backend core

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/element-hq/synapse | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/synapse/homeserver.yaml.template`, `apps/blackout-server/synapse/*` | Backend Platform | Adopt now |
| https://github.com/element-hq/matrix-authentication-service | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/mas/config.yaml.template`, `deploy/docker/blackout-backend/nginx/nginx.conf` | Identity & Access | Adopt now |
| https://github.com/matrix-org/sygnal | archived | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/sygnal/sygnal.yaml` | Messaging Infrastructure | Monitor |
| https://github.com/livekit/livekit | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/livekit/config.yaml`, `apps/blackout-client/src/app/features/calls/*` | Realtime Platform | Adopt now |

## Client core

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/element-hq/element-web | active | `_port/*`, `apps/blackout-client/*`, `apps/blackout-web/*` | Client Platform | Adopt now |
| https://github.com/matrix-org/matrix-react-sdk | archived | `_port/src/*` (legacy imported surface), `apps/blackout-client/src/app/plugins/*` | Client Platform | Defer |

## Moderation

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/the-draupnir-project/Draupnir | active | `deploy/docker/blackout-backend/docker-compose.yml`, `deploy/docker/blackout-backend/draupnir/*`, `apps/blackout-client/src/app/features/moderation/*` | Trust & Safety Engineering | Adopt now |

## Bridges/integrations

| Repo | Status | Blackout touchpoints | Owner inside Blackout team | Decision |
| --- | --- | --- | --- | --- |
| https://github.com/matrix-org/matrix-hookshot | active | `deploy/docker/blackout-backend/integrations/*`, `deploy/docker/blackout-backend/docker-compose.yml` (`integrations` profile) | Integrations Team | Adopt now |
| https://github.com/matrix-org/matrix-appservice-bridge | active | `apps/blackout-server/services/*`, `apps/deaddrop-appservice/*`, `deploy/docker/blackout-backend/synapse/homeserver.yaml.template` (`app_service_config_files`) | Integrations Team | Monitor |
| https://github.com/mautrix/discord | active | `apps/blackout-server/services/bridges/*`, `deploy/docker/blackout-backend/integrations/*` | Integrations Team | Defer |

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
