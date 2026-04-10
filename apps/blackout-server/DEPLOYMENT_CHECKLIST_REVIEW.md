# Blackout Core — Railway Deployment Checklist Review

Review of the `Blackout_server` codebase against the deployment checklist for getting
Blackout Core running on Railway. This repo is a **Synapse (Matrix homeserver) fork** —
it is the backend engine. Many checklist items reference separate services (frontend, API
layer) that live outside this repo.

---

## 0. MVP Scope Definition

| Item | Status | Notes |
|------|--------|-------|
| Servers = Matrix Spaces | READY | Synapse natively supports Spaces (hierarchical rooms) |
| Channels = Rooms | READY | Core Matrix concept, fully implemented |
| No federation (centralized) | CONFIGURABLE | `federation_domain_whitelist: []` disables federation — **now set in template** |
| Web app only | N/A | No frontend in this repo; needs separate `blackout-web` service |
| Basic chat + auth + server creation | READY | Full Matrix Client-Server API available |
| Voice = Phase 2 | DEFERRED | TURN/STUN config exists; no LiveKit integration yet |

---

## 1. Railway Project Setup

| Item | Status | Notes |
|------|--------|-------|
| Railway project config | READY | `railway.toml` configured (DOCKERFILE builder) |
| matrix-homeserver service | READY | This repo IS the homeserver |
| postgres service | CONFIGURED | Env vars: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` |
| redis service | CONFIGURED | Env vars: `REDIS_HOST`, `REDIS_PORT` |
| blackout-api service | MISSING | No separate API layer — Matrix API exposed directly |
| blackout-web service | MISSING | No frontend service in this repo |
| DATABASE_URL | PARTIAL | Uses separate vars, not a single URL |
| REDIS_URL | PARTIAL | Uses separate vars, not a single URL |
| SECRET_KEY | MAPPED | Uses `REGISTRATION_SHARED_SECRET` |
| JWT_SECRET | NOW CONFIGURED | Added to `.env.example` and `homeserver.yaml.template` |
| HOMESERVER_URL | MAPPED | Uses `SERVER_NAME` → derives `public_baseurl` |

---

## 2. Matrix Homeserver

| Item | Status | Notes |
|------|--------|-------|
| Deploy Synapse container | READY | `services/blackout-server/Dockerfile` — multi-stage build |
| Connect to Postgres | READY | `psycopg2` configured in template |
| Disable federation | NOW CONFIGURED | `federation_domain_whitelist: []` added; port 8448 listener removed |
| Enable registration | CONFIGURABLE | `ENABLE_REGISTRATION` env var added (default: false) |
| Media storage | LOCAL | Local filesystem for MVP; S3 can be added later |
| Set server name | READY | `SERVER_NAME` env var, defaults to `localhost` |
| Create admin user | READY | `register_new_matrix_user` CLI tool available |

---

## 3. Database Layer

| Item | Status | Notes |
|------|--------|-------|
| Postgres → Synapse | READY | `psycopg2` configured |
| Postgres → API service | N/A | No separate API service exists |
| Redis enabled | READY | Worker replication + caching |
| Redis for sessions | PARTIAL | Used for worker coordination, not traditional sessions |
| Redis for rate limiting | NOT YET | Rate limiting uses in-memory storage |
| Redis for presence | NOT YET | Presence uses in-memory/DB |

---

## 4. Blackout API Layer (Control Layer)

**This is the biggest gap.** The checklist expects a separate API layer that abstracts
Matrix into Discord-like concepts. This repo only provides the Matrix engine.

| Item | Status | Notes |
|------|--------|-------|
| Separate API service | NOW IMPLEMENTED | `services/blackout-api` FastAPI service added |
| Auth (JWT) | PARTIAL | JWT login module exists but API abstraction layer needed |
| User abstraction | NOT IMPLEMENTED | Users see Matrix-style `@user:server` IDs |
| Server (Space) creation | NATIVE MATRIX | Via `POST /createRoom` with `type: m.space` |
| Role/permission system | MATRIX POWER LEVELS | Numeric (0-100), not named Owner/Admin/Member roles |
| Billing hooks | STUB | `monetization.py` + DB tables exist; billing is stub-only |
| Custom endpoints | PARTIAL | Core `/v1/servers`, `/v1/channels`, `/gateway` abstraction routes now implemented |
| User ↔ Matrix User ID mapping | TABLE READY | `user_map` table implemented in blackout-api |
| Server ↔ Space ID mapping | TABLE READY | `server_map` table implemented in blackout-api |
| Channel ↔ Room ID mapping | TABLE READY | `channel_map` table implemented in blackout-api |

**Action needed:** Complete blackout-api production hardening (migrations, full authz policy, and end-to-end integration).

---

## 5. Frontend (Discord-like UX)

| Item | Status | Notes |
|------|--------|-------|
| React/Next.js app | DOES NOT EXIST | No frontend code in this repo |
| Auth pages | MINIMAL | Basic login HTML in `synapse/static/client/login/` |
| Dashboard/sidebar/chat | DOES NOT EXIST | — |

**Action needed:** Build a separate `blackout-web` service (React/Next.js).

---

## 6. Matrix Integration Layer

| Item | Status | Notes |
|------|--------|-------|
| Option A (direct Matrix API from frontend) | AVAILABLE | Client-Server API fully implemented |
| Option B (proxy through API) | IN PROGRESS | Blackout API service now exists with JWT + Matrix token passthrough contract |

Recommendation: Start with Option A, migrate to B after API layer is built.

---

## 7. Identity Abstraction

| Item | Status | Notes |
|------|--------|-------|
| Clean usernames | NOT IMPLEMENTED | `@user:server_name` format exposed |
| Mapping in DB | NOT IMPLEMENTED | No user abstraction tables |
| API → JWT login | PARTIAL | JWT module exists, not wired to abstraction layer |
| Matrix login token sync | NOT IMPLEMENTED | — |

---

## 8. Media Handling (MVP)

| Item | Status | Notes |
|------|--------|-------|
| File uploads in Synapse | READY | `synapse/rest/media/upload_resource.py` |
| Upload UI | NOT IN THIS REPO | Frontend needed |
| File size limits | CONFIGURABLE | `max_upload_size` in config (default 50MB) |

---

## 9. Permissions (Basic Version)

| Item | Status | Notes |
|------|--------|-------|
| Owner/Admin/Member roles | NOT ABSTRACTED | Matrix uses numeric power levels |
| Map roles → power levels | NOT IMPLEMENTED | Needs API layer |

---

## 10. Real-Time Messaging

| Item | Status | Notes |
|------|--------|-------|
| Matrix /sync | READY | Full implementation at `/_matrix/client/v3/sync` |
| WebSocket proxy | NOT IMPLEMENTED | HTTP long-polling only |
| Instant messages | READY | Via /sync with timeout parameter |
| Fast channel switching | READY | Synapse handles room-level sync efficiently |

---

## 11. Testing Checklist

| Item | Status | Notes |
|------|--------|-------|
| Register/login | READY | Via Matrix API |
| Create server (Space) | READY | Via Matrix API |
| Create channels (Rooms) | READY | Via Matrix API |
| Real-time messages | READY | Via /sync |
| Multi-user join | READY | Matrix native |
| No federation leakage | NOW CONFIGURED | Federation disabled in template |

---

## 12. Deploy & Validate on Railway

| Item | Status | Notes |
|------|--------|-------|
| All services deployed | PARTIAL | Only homeserver configured; no API or web services |
| Env vars | READY | `.env.example` updated with all required vars |
| Healthcheck | READY | `/_matrix/client/versions` in `railway.toml` |
| Logs clean | NEEDS RUNTIME VALIDATION | — |

---


## 12.1 Blackout API Endpoint Coverage (Requested Update)

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/v1/servers/{id}/members` | NEW | Added in API surface plan |
| PATCH | `/v1/servers/{id}` | NEW | Added in API surface plan |
| DELETE | `/v1/servers/{id}` | NEW | Added in API surface plan |
| POST | `/v1/servers/{id}/join` | EXISTED | Already present in prior API design |
| DELETE | `/v1/servers/{id}/leave` | EXISTED | Already present in prior API design |
| PUT | `/v1/servers/{id}/members/{id}/role` | FIXED | Pydantic model correction applied |
| GET | `/v1/servers/{id}/channels` | NEW | Added in API surface plan |
| POST | `/v1/servers/{id}/channels` | EXISTED | Already present in prior API design |
| DELETE | `/v1/channels/{id}` | EXISTED | Already present in prior API design |
| GET | `/v1/channels/{id}/messages` | EXISTED | Already present in prior API design |
| POST | `/v1/channels/{id}/messages` | EXISTED | Already present in prior API design |
| WS | `/gateway` | EXISTED | Already present in prior API design |

## 13. Phase 2 Items

| Item | Status | Notes |
|------|--------|-------|
| Voice (LiveKit) | NOT STARTED | TURN config exists; no LiveKit |
| Presence | BASIC | Synapse presence + Blackout extensions in `blackout_runtime/` |
| Notifications | SYNAPSE NATIVE | Push notification system exists |
| Server invites | MATRIX NATIVE | Room invite system works |
| AI agents (Hermes) | STUB | `OLLAMA_URL` env var; no integration |
| Marketplace (FBM) | STUB | `FBM_API_URL` env var; monetization tables exist |

---

## Summary

### What's Ready in This Repo
- Synapse homeserver with production Dockerfile
- PostgreSQL + Redis configuration
- Full Matrix Client-Server API (auth, rooms, spaces, messages, media, sync)
- Entrypoint with profile auto-detection (managed/standalone/constrained)
- Healthcheck endpoints
- Media upload/download
- TURN/STUN configuration
- Monetization DB foundations (stub)
- Operational docs and runbooks
- Federation disabled for MVP (after this review's fixes)

### Blockers Fixed by This Review
1. Railway config conflict resolved (consolidated to `railway.toml`)
2. Federation disabled in `homeserver.yaml.template`
3. JWT configuration wired into template
4. Registration toggle added via `ENABLE_REGISTRATION` env var
5. `.env.example` updated with missing vars

### Major Gaps (Separate Services Needed)
1. **`blackout-api`** — Node.js/FastAPI service wrapping Matrix API with Discord-like endpoints, identity abstraction, and mapping tables
2. **`blackout-web`** — React/Next.js frontend with Discord-like UI (sidebar, channels, chat)
3. **Identity abstraction** — User/Server/Channel mapping tables (belongs in `blackout-api`)
4. **Role system** — Named roles mapped to Matrix power levels (belongs in `blackout-api`)
