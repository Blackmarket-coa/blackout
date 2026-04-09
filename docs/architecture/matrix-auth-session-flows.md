# Matrix Client Auth & Session Flow Design

## Scope

This document defines the client-side and backend contract for:

- Login / logout
- Access token refresh and rotation
- Session restore on app relaunch
- Multi-device session handling
- Revoked-session behavior

The design targets Matrix CS API compatibility while adding a thin **Session Broker API** for secure refresh handling and session governance.

---

## Design Goals

1. **Matrix-compatible auth** for broad homeserver support.
2. **Short-lived access tokens** with refresh token rotation.
3. **Crash-safe session restore** without forcing full login each launch.
4. **Strong multi-device visibility** (active devices, last seen, revoke).
5. **Deterministic revocation UX** when tokens/sessions are invalidated.
6. **Crypto-safe logout** (clear local secrets unless explicitly retained for migration).

---

## Architecture Overview

Participants:

- **Client App**: web/mobile/desktop Matrix client.
- **Auth UI**: login screen and SSO callback handler.
- **Session Manager**: local state machine for tokens and session lifecycle.
- **Secure Storage**: Keychain/Keystore/IndexedDB wrapper for secrets.
- **Matrix Homeserver (HS)**: `/login`, `/logout`, `/sync`, device APIs.
- **Session Broker (optional but recommended)**: first-party backend that stores refresh-token family metadata, applies rotation/replay detection, and normalizes auth responses.

> If Session Broker is unavailable, the client may use native Matrix refresh directly (`/_matrix/client/v3/refresh`) with reduced replay-detection and governance controls.

---

## Session Model

```ts
export type SessionState =
  | "ANONYMOUS"
  | "AUTHENTICATING"
  | "ACTIVE"
  | "REFRESHING"
  | "SOFT_LOGGED_OUT"
  | "HARD_LOGGED_OUT"
  | "REVOKED";

export interface SessionRecord {
  sessionId: string;              // stable UUID created by broker/client
  userId: string;                 // @alice:example.org
  deviceId: string;               // Matrix device_id
  accessToken: string;            // short lived
  accessTokenExpiresAt: string;   // ISO8601 UTC
  refreshToken?: string;          // opaque; optional if HS doesn't support
  refreshFamilyId?: string;       // for rotation replay detection
  scopes: string[];               // e.g. ["matrix:client"]
  homeserverUrl: string;
  slidingSyncProxyUrl?: string;
  oidcIssuer?: string;
  createdAt: string;
  lastRefreshAt?: string;
  revokedAt?: string;
  logoutReason?:
    | "user_initiated"
    | "remote_revocation"
    | "refresh_replay_detected"
    | "password_reset"
    | "account_deactivated"
    | "unknown";
}
```

---

## Flow 1: Login

Supports password, SSO/OIDC, and token login variants.

### Sequence Diagram (text)

```text
Client App        Auth UI        Session Manager       Matrix HS        Session Broker
    |                |                  |                 |                   |
    |-- open app --->|                  |                 |                   |
    |                |-- collect creds/SSO ------------->|                   |
    |                |<-- login challenge/result --------|                   |
    |                |-- auth result ------------------->|                   |
    |                |                  |-- exchange/normalize ------------->|
    |                |                  |<-- session bundle (AT,RT,exp,ids)--|
    |                |                  |-- persist secrets -----------------> Secure Storage
    |                |                  |-- /sync bootstrap ---------------->| Matrix HS
    |<-- enter ACTIVE state ------------|<-- initial sync data --------------|
```

### API Contract

#### A) Matrix-native login

`POST /_matrix/client/v3/login`

Request (password example):

```json
{
  "type": "m.login.password",
  "identifier": { "type": "m.id.user", "user": "alice" },
  "password": "***",
  "device_id": "D123ABC",
  "initial_device_display_name": "Alice iPhone"
}
```

Response:

```json
{
  "user_id": "@alice:example.org",
  "access_token": "atk_...",
  "device_id": "D123ABC",
  "refresh_token": "rtk_...",
  "expires_in_ms": 300000,
  "well_known": {
    "m.homeserver": { "base_url": "https://matrix.example.org" }
  }
}
```

#### B) Broker-normalized login (recommended)

`POST /v1/sessions/login`

Request:

```json
{
  "provider": "matrix_password",
  "homeserver_url": "https://matrix.example.org",
  "identifier": "alice",
  "secret": "***",
  "device": {
    "device_id": "D123ABC",
    "display_name": "Alice iPhone",
    "platform": "ios"
  }
}
```

Response:

```json
{
  "session_id": "2d8e6c0b-...",
  "user_id": "@alice:example.org",
  "device_id": "D123ABC",
  "access_token": "atk_...",
  "access_token_expires_at": "2026-04-09T12:00:00Z",
  "refresh_token": "rtk_...",
  "refresh_family_id": "fam_...",
  "homeserver_url": "https://matrix.example.org"
}
```

Error envelope (all broker endpoints):

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Username or password is incorrect",
    "retryable": false,
    "hint": "Check account password or use SSO"
  }
}
```

---

## Flow 2: Token Refresh + Rotation

### Policy

- Refresh when `now >= expires_at - 60s`.
- Single-flight refresh per session (prevent stampede).
- Rotate both access and refresh tokens each refresh.
- If old refresh token is replayed, mark family compromised and revoke all descendants.

### Sequence Diagram (text)

```text
Client App      Session Manager      Secure Storage      Session Broker      Matrix HS
    |                 |                    |                   |                 |
    |-- API call ---->|                    |                   |                 |
    |                 |-- token near exp? -> yes               |                 |
    |                 |-- lock(session_id)                     |                 |
    |                 |-- read refresh token -->|              |                 |
    |                 |-- POST /v1/sessions/refresh ---------->|-- /refresh --->|
    |                 |                                          |<-- new AT/RT --|
    |                 |<-- new AT/RT + exp + family state ------|                 |
    |                 |-- atomic store new tokens ------------->|                 |
    |                 |-- unlock                                |                 |
    |<-- retry with new AT--|                                   |                 |
```

### API Contract

#### Matrix-native refresh

`POST /_matrix/client/v3/refresh`

Request:

```json
{ "refresh_token": "rtk_old" }
```

Response:

```json
{
  "access_token": "atk_new",
  "refresh_token": "rtk_new",
  "expires_in_ms": 300000
}
```

#### Broker refresh

`POST /v1/sessions/refresh`

Request:

```json
{
  "session_id": "2d8e6c0b-...",
  "refresh_token": "rtk_old",
  "device_id": "D123ABC"
}
```

Success:

```json
{
  "access_token": "atk_new",
  "access_token_expires_at": "2026-04-09T12:05:00Z",
  "refresh_token": "rtk_new",
  "refresh_family_id": "fam_...",
  "rotation_counter": 17
}
```

Replay detected:

```json
{
  "error": {
    "code": "REFRESH_REPLAY_DETECTED",
    "message": "Refresh token reuse detected; session family revoked",
    "retryable": false
  }
}
```

Client behavior on replay error:

1. Transition to `REVOKED`.
2. Stop sync/event streams.
3. Wipe local session secrets.
4. Show blocking UX: “Session expired for security reasons. Sign in again.”

---

## Flow 3: Session Restore

On cold start, restore without user friction if tokens are valid.

### Sequence Diagram (text)

```text
Client App      Session Manager      Secure Storage       Matrix HS / Broker
    |                 |                    |                     |
    |-- app launch -->|                    |                     |
    |                 |-- load SessionRecord -->|                |
    |                 |<-- record / none -------|                |
    |                 |-- if none => ANONYMOUS                  |
    |                 |-- if expiring => refresh --------------->|
    |                 |<-- refreshed or error -------------------|
    |                 |-- start /sync --------------------------->|
    |                 |<-- sync ok / 401 ------------------------|
    |<-- ACTIVE or REVOKED state --------------------------------|
```

### Restore algorithm

1. Read `SessionRecord` from secure storage.
2. Validate shape, timestamps, and homeserver URL allowlist.
3. If access token valid for >60s, attempt `/sync` immediately.
4. Else refresh first.
5. If `/sync` returns `401 M_UNKNOWN_TOKEN`:
   - attempt exactly one refresh (if refresh token present), then retry `/sync` once.
   - if still unauthorized, mark session `REVOKED`.
6. Emit telemetry event `session_restore_result` with reason code.

---

## Flow 4: Logout

Two variants: local-only sign-out and global logout.

### Sequence Diagram (text)

```text
Client App      Session Manager      Matrix HS       Session Broker     Secure Storage
    |                 |                 |                 |                   |
    |-- user logout ->|                 |                 |                   |
    |                 |-- POST /logout ------------------>| (or direct HS)    |
    |                 |<-- 200/401 -----------------------|                   |
    |                 |-- optionally POST /logout/all ----------------------->|
    |                 |-- stop sync + crypto workers                          |
    |                 |-- wipe AT/RT + key material ------------------------->|
    |<-- HARD_LOGGED_OUT -----------------------------------------------------|
```

### API Contract

Matrix endpoints:

- `POST /_matrix/client/v3/logout` (current device)
- `POST /_matrix/client/v3/logout/all` (all devices)

Broker endpoints:

- `POST /v1/sessions/logout` body `{ "session_id": "..." }`
- `POST /v1/sessions/logout_all` body `{ "user_id": "@alice:example.org" }`

Response (broker):

```json
{ "ok": true, "revoked_sessions": 1 }
```

Client requirements:

- Treat server `401` during logout as success for local cleanup.
- Always clear local tokens, sync cursors, to-device queues, and encrypted caches keyed by session.

---

## Flow 5: Multi-Device Handling

### Capabilities

- List all active devices/sessions.
- Display last seen, IP/ASN (if available), device display name.
- Revoke specific device from another device.
- Detect “self revoked” quickly from sync failures.

### Sequence Diagram (text) – Remote Device Revocation

```text
Device A (web)      Matrix HS/Broker        Device B (mobile)
     |                    |                       |
     |-- list devices --->|                       |
     |<-- A,B,C ----------|                       |
     |-- revoke B ------->|                       |
     |<-- 200 ------------|                       |
     |                    |---- invalidate token family for B --->
     |                    |                       |-- next /sync => 401
     |                    |                       |-- attempt refresh => denied
     |                    |                       |-- transition REVOKED
```

### API Contract

Matrix-native:

- `GET /_matrix/client/v3/devices`
- `GET /_matrix/client/v3/devices/{deviceId}`
- `DELETE /_matrix/client/v3/devices/{deviceId}`
- `POST /_matrix/client/v3/delete_devices`

Broker-enhanced:

- `GET /v1/sessions?user_id=@alice:example.org`
- `DELETE /v1/sessions/{session_id}`

`GET /v1/sessions` response:

```json
{
  "sessions": [
    {
      "session_id": "...",
      "device_id": "D123ABC",
      "display_name": "Alice iPhone",
      "platform": "ios",
      "last_seen_at": "2026-04-09T11:58:12Z",
      "last_seen_ip": "203.0.113.10",
      "current": true,
      "risk": "low"
    }
  ]
}
```

---

## Revoked Session Behavior (Client UX + State Machine)

### Triggers

- Refresh endpoint returns replay/invalid-grant.
- `/sync` repeatedly returns `401 M_UNKNOWN_TOKEN` after one refresh retry.
- Explicit remote session revoke notification/event.
- Password reset or account deactivation signal from server.

### Required behavior

1. Enter `REVOKED` state (distinct from user logout).
2. Stop outbound requests except re-auth endpoints.
3. Preserve unsent drafts in non-sensitive storage (optional, product decision).
4. Purge session-bound secrets immediately.
5. Show non-dismissible banner/modal with reason and timestamp.
6. Offer primary CTA: “Sign in again”.
7. For deactivated accounts, route to support/contact flow instead of login loop.

---

## State Machine

```text
ANONYMOUS
  -> AUTHENTICATING (begin login)
AUTHENTICATING
  -> ACTIVE (login success)
  -> ANONYMOUS (login cancel/fail)
ACTIVE
  -> REFRESHING (token near expiry)
  -> HARD_LOGGED_OUT (user logout)
  -> REVOKED (401 + refresh failure / remote revoke)
REFRESHING
  -> ACTIVE (refresh success)
  -> REVOKED (refresh replay/invalid)
SOFT_LOGGED_OUT
  -> AUTHENTICATING (user re-login)
REVOKED
  -> AUTHENTICATING (fresh login only)
HARD_LOGGED_OUT
  -> AUTHENTICATING (fresh login only)
```

---

## Security Requirements

- Store refresh tokens only in platform secure storage.
- Never log access/refresh tokens (including debug logs).
- Use TLS pinning where platform policy allows (mobile/desktop).
- Bind refresh token usage to device/session metadata when broker is used.
- Enforce rotation with replay detection (refresh token family invalidation).
- Rate-limit login and refresh by IP + device fingerprint.
- On logout, destroy local Olm/Megolm session material tied to account unless migration flow is explicitly active.

---

## Error Taxonomy (normalized)

| Code | HTTP | Retry | Meaning | Client action |
|---|---:|---|---|---|
| `INVALID_CREDENTIALS` | 401 | No | Bad username/password/SSO assertion | Show inline error |
| `MFA_REQUIRED` | 401 | No | Additional factor needed | Branch to MFA UX |
| `TOKEN_EXPIRED` | 401 | Yes | Access token expired | Refresh and retry once |
| `REFRESH_INVALID` | 401 | No | Refresh token invalid/revoked | Move to REVOKED |
| `REFRESH_REPLAY_DETECTED` | 401 | No | Refresh reuse detected | Move to REVOKED + security notice |
| `ACCOUNT_DEACTIVATED` | 403 | No | User account disabled | Block login, show support path |
| `HS_UNREACHABLE` | 503 | Yes | Homeserver unavailable | Backoff + offline mode |

---

## Recommended Client Interfaces

```ts
interface AuthApi {
  login(input: LoginRequest): Promise<LoginResponse>;
  refresh(input: RefreshRequest): Promise<RefreshResponse>;
  logout(input: LogoutRequest): Promise<void>;
  logoutAll(input: LogoutAllRequest): Promise<void>;
  listSessions(input: ListSessionsRequest): Promise<ListSessionsResponse>;
  revokeSession(input: RevokeSessionRequest): Promise<void>;
}

interface SessionManager {
  current(): SessionRecord | null;
  restore(): Promise<SessionState>;
  requireValidAccessToken(): Promise<string>;
  transition(next: SessionState, reason?: string): void;
  clearAllSecrets(reason: string): Promise<void>;
}
```

---

## Operational & Telemetry Events

Emit structured events:

- `auth_login_started`
- `auth_login_succeeded`
- `auth_login_failed`
- `auth_refresh_started`
- `auth_refresh_succeeded`
- `auth_refresh_failed`
- `session_restore_result`
- `session_revoked`
- `logout_completed`

Required fields: `user_id_hash`, `session_id`, `device_id`, `homeserver`, `error_code`, `network_type`, `app_version`, `timestamp`.

---

## Rollout Plan

1. Ship state machine + secure storage abstraction.
2. Enable short-lived AT + refresh on supported homeservers.
3. Add broker normalization and refresh replay protection.
4. Expose multi-device session management UI.
5. Add revoked-session UX and telemetry dashboards.

