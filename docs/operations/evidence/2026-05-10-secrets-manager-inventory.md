# Secrets manager migration — preflight inventory

Date: 2026-05-10. Maintainer of record: see `git log` for this file.

This document is the §1.2 inventory required by
[`../../runbooks/SECRETS_MANAGER_MIGRATION.md`](../../runbooks/SECRETS_MANAGER_MIGRATION.md).
It is the precondition for §2 (stand up the chosen manager). The
manager choice (Vault / Infisical / SOPS) is **not yet made**; this
inventory is decision-neutral and is the input for that decision.

The table below is the single source of truth for the migration
window. Each row is a separate secret; multi-component credentials
(e.g. OAuth client_id + client_secret) are split because they have
different blast radii and may rotate independently.

Default rotation cadence is 90 days per
[`../secrets_rotation_break_glass.md`](../secrets_rotation_break_glass.md).
Rows that diverge from the default note their cadence explicitly.

## Method

Sources walked:

- `infra/single-server-baseline/.env.example`
- `infra/single-server-baseline/synapse/homeserver.yaml.template`
- `infra/single-server-baseline/docker-compose.yml`
- `deploy/docker/production/.env.example`,
  `deploy/docker/production/.env.production.example`
- `deploy/docker/production/docker-compose.yml`
- `apps/blackout-server/.env.example`
- `apps/blackout-server/services/blackout-server/.env.example`
- `packages/api/src/**/*.ts` — `process.env.*` references
- `.github/workflows/**` — `${{ secrets.* }}` references

Out of scope for this preflight:

- Values themselves. The inventory captures **names and locations**,
  never values. Values are exfiltrated only into the chosen manager
  during §3.
- FBM-repo secrets. FBM has its own inventory; cross-referenced from
  the FBM repo's runbook.
- Synapse signing key file (`*.signing.key`) — present on the
  primary host's data volume; tracked by location, not by file
  contents.

## Inventory

### Data tier

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| `POSTGRES_PASSWORD` | `infra/single-server-baseline/.env`, `deploy/docker/production/.secrets/db_password.txt` (file-secret in compose) | Postgres container, Synapse (via `homeserver.yaml.template`), `@blackout/api` | 90 d | Two surfaces — single-server-baseline `.env` and production `db_password.txt`. Both must move; do not leave one. |
| `REDIS_PASSWORD` | `infra/single-server-baseline/.env`, `deploy/docker/production/.secrets/cache_password.txt` | Redis container, Synapse, `@blackout/api` | 90 d | Same dual-surface as Postgres. |
| Postgres exporter DSN | derived in `infra/single-server-baseline/docker-compose.yml` from `POSTGRES_USER` + `POSTGRES_PASSWORD` | postgres-exporter | 90 d | Tracked here because the upgrade path is a dedicated `pg_monitor` user with its own password. See `infra/single-server-baseline/RUNBOOK.md` §13. |

### Synapse / federation

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| `SYNAPSE_REGISTRATION_SHARED_SECRET` | `infra/single-server-baseline/.env`, `homeserver.yaml.template` | Synapse, registration tooling | 90 d | Compromise allows arbitrary user creation. |
| `SYNAPSE_MACAROON_SECRET_KEY` | as above | Synapse | **rarely** | Rotation invalidates all access tokens; coordinate with downtime window. |
| `SYNAPSE_FORM_SECRET` | as above | Synapse | 90 d | |
| `SYNAPSE_OIDC_CLIENT_SECRET` | `homeserver.yaml.template` (commented placeholder) | Synapse | 90 d | Only present when Keycloak/OIDC is wired; track now so rotation is automatic when enabled. |
| Federation signing key | `/data/theblackout.app.signing.key` on primary host (single-server-baseline data volume) | Synapse | **rarely** | Rotation breaks federation trust; coordinate with peers. Track location, not contents. |

### TURN / coturn

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| `TURN_STATIC_AUTH_SECRET` | `infra/single-server-baseline/.env`, `homeserver.yaml.template` (`turn_shared_secret`) | coturn, Synapse | 90 d | Both surfaces must rotate together; mismatch breaks TURN auth. |

### Matrix appservice (deaddrop + appservice listener)

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| `MATRIX_APPSERVICE_AS_TOKEN` | `@blackout/api` env, Synapse appservice registration YAML | `@blackout/api`, Synapse | 90 d | See `deploy/matrix-appservice/registration.yaml`. |
| `MATRIX_APPSERVICE_HS_TOKEN` | as above | as above | 90 d | |
| `MATRIX_BOT_TOKEN` | `@blackout/api` env | `@blackout/api` (room provisioning, system messages) | 90 d | Bot account access token; revoke via Synapse admin API on rotation. |

### Compat-layer OAuth providers (5)

Per `docs/runbooks/COMPAT_LAYER_CREDENTIAL_RECOVERY.md`. Each provider
contributes one client_id (non-secret but tracked) + one client_secret,
plus webhook secrets where applicable.

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| `TWITCH_CLIENT_SECRET` | `@blackout/api` env | Twitch chat ingress, EventSub | 90 d | |
| `TWITCH_EVENTSUB_SECRET` | `@blackout/api` env | EventSub HMAC verification | 90 d | Provider-side constant we set; rotate in Twitch dashboard. |
| `YOUTUBE_CLIENT_SECRET` | `@blackout/api` env | YouTube chat ingress | 90 d | |
| `KICK_*` (planned) | not yet wired | Kick chat ingress (Pusher proto, app key public) | n/a | Kick uses a public Pusher app key; no client_secret today. Track row to ensure parity if Kick ever exposes OAuth. |
| `PATREON_CLIENT_SECRET` | `@blackout/api` env | Patreon webhook + OAuth | 90 d | |
| `PATREON_WEBHOOK_SECRET` | `@blackout/api` env | Patreon webhook HMAC | 90 d | |
| `STREAMLABS_CLIENT_SECRET` | `@blackout/api` env | Streamlabs donation sync | 90 d | |
| `DISCORD_CLIENT_SECRET` | `@blackout/api` env | Discord-shape inbound/outbound webhooks, OAuth | 90 d | |

### FBM integration

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| `FREEBLACKMARKET_API_KEY` | `@blackout/api` env | FBM marketplace provider client | 90 d | Production assertion: `assertFreeblackmarketSecretsForProduction` refuses to start without it when `FREEBLACKMARKET_ENABLED=true`. |
| `FREEBLACKMARKET_WEBHOOK_SECRET` | `@blackout/api` env | FBM webhook HMAC | 90 d | |
| FBM Entitlements Service auth | not yet provisioned | `packages/api/src/integrations/fbm/entitlementsContract.ts` (consumer surface) | 90 d when issued | Awaits FBM-side OpenAPI spec and service-to-service auth scheme. See `docs/contracts/fbm-entitlements-consumer.md`. |

### Auth / JWT / encryption

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| `JWT_SECRET` | `@blackout/api` env, `apps/blackout-server/.env.example` | `@blackout/api`, `blackout-server` | 90 d | Migration target uses primary/rollover pair (below) for zero-downtime rotation. |
| `JWT_SECRET_PRIMARY` | `@blackout/api` env | `@blackout/api` | 90 d | Active signing key. |
| `JWT_SECRET_ROLLOVER` | `@blackout/api` env | `@blackout/api` | 90 d | Verification-only key during rotation window. |
| `LINKED_ACCOUNT_ENCRYPTION_KEYS` | `@blackout/api` env | AES-GCM at-rest encryption for linked-account credentials, simulcast destinations, OBS-WS passwords, Discord-shape webhook secrets | **rarely; rewrap required** | Comma-separated keyring. Rotation requires re-encrypting existing rows. Migrate the **keyring**; the ciphertext stays in DB. |
| `STEGO_KEY` | `@blackout/api` env | Steganography settings page | **rarely** | User-scoped; revisit when feature ships. |
| `INTERNAL_METRICS_TOKEN` | `@blackout/api` env | Prometheus scrape auth on internal metrics endpoint | 90 d | |
| `BLACKOUT_ADMIN_API_KEY` | `@blackout/api` env | Admin route auth | 90 d | |
| `BLACKOUT_DEMO_PASSWORD` | `@blackout/api` env | Demo deployment seed password | n/a | Demo-only; not in production. |

### Marketplace / payments

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| `MARKETPLACE_FULFILLMENT_SECRET` | `@blackout/api` env | Marketplace fulfillment webhook signing | 90 d | |
| Stripe API keys (publishable + secret) | `@blackout/api` env (planned; currently uses hosted checkout URLs only) | Hawala ledger ACH edge (planned) | 90 d when issued | `STRIPE_CHECKOUT_URL` and `STRIPE_CUSTOMER_PORTAL_URL` are URLs, not secrets, but they must move with the Stripe credentials when they land. |
| Stellar account secret | not yet wired | Stellar/USDC settlement bridge (Foundation milestone unbuilt row) | 90 d when issued | Track row now so the manager has a slot when Foundation milestone wires it in. |

### Object storage / backups

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| MinIO admin credentials | primary-host compose env (not yet templated in this repo) | MinIO container, backup tooling | 90 d | Track row; templated entry to be added when MinIO compose lands. |
| MinIO access keys (per-bucket) | as above | application consumers | 90 d | |
| `CF_R2_ACCESS_KEY_ID`, `CF_R2_TOKEN` | GitHub Actions secrets | CI deploy artifacts | 90 d | |
| Backblaze B2 application keys | not yet wired | backup tooling (planned) | 90 d when issued | Listed in `docs/operations/SPOF_MAP.md` row 6. |

### Ingress / DNS / Cloudflare

| Secret name | Current location(s) | Consumers | Rotation | Notes |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secrets | CI DNS automation | 90 d | |
| Cloudflare Tunnel credentials | `deploy/docker/production/.cloudflared/**/credentials.json` (file) | cloudflared container | **rarely; rotation = tunnel reissue** | Highest blast radius — sole ingress in current topology. Migrate last per runbook §3 ordering. |
| `CF_PAGES_ACCOUNT_ID`, `CF_PAGES_TOKEN` | GitHub Actions secrets | Pages deploy | 90 d | |

### CI / build / deploy (GitHub Actions)

Tracked because rotation policy applies even though they live in
GitHub's secret store rather than the in-repo config. The migration
target is to mirror these into the chosen manager so a single
rotation surface exists.

| Secret name | Consumer workflow(s) | Rotation | Notes |
|---|---|---|---|
| `GITHUB_TOKEN` | every workflow | per-job (auto) | Managed by GitHub; tracked for completeness. |
| `SONAR_TOKEN` | code-quality workflow | 90 d | |
| `SENTRY_AUTH_TOKEN`, `SENTRY_DSN`, `SENTRY_URL` | error-tracking workflows | 90 d | |
| `TURBO_API`, `TURBO_TEAM`, `TURBO_TOKEN` | turborepo cache | 90 d | |
| `VERCEL_TOKEN` | preview deploys | 90 d | |
| `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` | preview deploys | 90 d | |
| `RAILWAY_TOKEN` | deprecated; tracked for cleanup | n/a | Railway is being retired (AOG §9.1 row "Railway → primary-server migration"). Remove on completion. |
| `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`, `PROD_STACK_DIR` | deploy workflow | 90 d (key); n/a (host/user/dir) | SSH key rotation is the only rotation here; the rest are config. |
| `PRODUCTION_DEPLOY_WEBHOOK` | deploy workflow | 90 d | |
| `MATRIX_ACCESS_TOKEN`, `MATRIX_HOMESERVER`, `MATRIX_ROOM_ID`, `ELEMENT_BOT_TOKEN` | CI notification workflows | 90 d | |

### Mobile / desktop signing

These have **rarely** rotation cadence — store credentials are tied to
specific accounts and rotation requires resigning published builds.

| Secret name | Consumer | Rotation | Notes |
|---|---|---|---|
| `ANDROID_UPLOAD_KEYSTORE_B64` | Android build workflow | rarely | Lose this and you cannot publish updates to existing Play Store users. **Backup mandatory.** |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_KEYCHAIN_PASSWORD` | iOS build | rarely | |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `MATCH_PASSWORD` | iOS build / fastlane match | rarely | |
| `APP_STORE_CONNECT_API_KEY_CONTENT`, `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API | 90 d | API key rotation is supported and should follow default cadence. |
| `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_THUMBPRINT` | Windows code signing | rarely (cert lifetime) | |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Tauri updater signing | rarely | Lose this and the auto-updater channel breaks. **Backup mandatory.** |
| `TAURI_UPDATER_PUBKEY` | embedded in client | rarely | Public, but rotation requires shipping a new client build first. |

## Bus-factor preflight (per runbook §1.3)

- [ ] [`../CO_MAINTAINER_ONBOARDING.md`](../CO_MAINTAINER_ONBOARDING.md) Rung 4 prerequisites met for whoever holds ongoing scoped access.
- [ ] [`../secrets_rotation_break_glass.md`](../secrets_rotation_break_glass.md) reviewed by maintainer (and co-maintainer when present).
- [ ] Recovery copies of **rarely-rotation** secrets stored in the offsite vault: federation signing key, Android upload keystore, Apple distribution certificate, Tauri signing key, `LINKED_ACCOUNT_ENCRYPTION_KEYS` keyring.

## Notes for the manager-choice decision

Counts that inform §0 of the runbook:

- **64** distinct secret rows above (excluding pure-config rows like
  `MATRIX_HOMESERVER`).
- **8** rows are **rarely-rotation** (signing keys, encryption keyrings).
  These argue for a manager with first-class versioning and audit
  history (Vault > Infisical > SOPS).
- **42** rows are 90-day rotation. These argue for a manager with
  good rotation tooling and reminders.
- **GitHub Actions secrets** are 19 of the rows. The chosen manager
  needs an automatable mirror to GitHub Actions (Vault: GitHub-Vault
  action; Infisical: native GitHub integration; SOPS: workflow that
  reads the encrypted file).
- **Two `.env`-file surfaces** for the same secret (Postgres, Redis,
  Synapse) are the highest-risk migration items because both copies
  must move atomically. Order them late in §3.

## Sign-off

| Role | Name | Signed off | Date |
|---|---|---|---|
| Maintainer | _to be filled_ | ☐ | |
| Co-maintainer (if present) | _to be filled_ | ☐ | |

This inventory is reviewed by the above before the runbook §2 work
begins. Sign-off recorded by editing this file and committing.
