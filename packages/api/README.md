# @blackout/server

This workspace lives at `packages/api` and is the canonical server runtime target.

-   **Workspace path:** `packages/api`
-   **Package name:** `@blackout/server`

Use `@blackout/server` in workspace filters and dependency declarations.

## Persistence

The default runtime uses a JSON-backed store (`FileBackedDb` in
`src/db/store.ts`) controlled by two env vars:

-   `BLACKOUT_DB_MODE` — `file` (default, persistent) or `memory` (tests only).
-   `BLACKOUT_DB_FILE` — path to the store file. Default resolves to
    `./.blackout/data/store.json` relative to the process cwd.

The default path is fine for local dev. In a container the cwd is inside
the image filesystem, so the file is wiped on every container recreate.
For production deploys set `BLACKOUT_DB_FILE=/data/blackout/store.json`
and mount a named volume on `/data/blackout` — otherwise invitations,
accounts, and everything else in the store will disappear the next time
`docker compose up -d` recreates the api service.

## Voice rooms (LiveKit)

The API exposes a LiveKit-compatible voice room lifecycle under `/v1/voice`.
Calls in the apps do not use it (they go through MatrixRTC and lk-jwt-service);
the web app reads only `GET /voice/rooms/open`.

-   `POST /voice/rooms/create` — create or rehydrate a canopy/channel room (`canopy_voice_rooms` backing model), in a listed canopy, by its moderators and admins.
-   `POST /voice/rooms/join` — join an existing room + mint short-lived LiveKit token (default TTL 300s). Joining does not create a room; a locked room admits moderators and admins only.
-   `POST /voice/token` — mint a token only, for an existing room; a locked room needs a moderator or admin.
-   `POST /voice/rooms/leave` — leave room and log duration.
-   `POST /voice/rooms/moderation/mute|remove|lock` — moderation controls for the canopy's moderators and admins. They record the action in the API (remove also ends the participant's session record); they do not mute or disconnect anyone in LiveKit, and a token already issued stays valid until it expires.
-   `GET /voice/rooms/:canopyId/:channelId/events` — room event feed (join/leave/moderation analytics), for signed-in callers.

A caller's role (`member`, `moderator`, `admin`) comes from the canopy's power
levels on the homeserver (`src/services/voiceRoleGate.ts`), never from the
request: `admin` at the level needed to change `m.room.power_levels`,
`moderator` at the canopy's `kick` level, `member` otherwise. A `role` in the
request body is ignored. The check needs `MATRIX_HOMESERVER` and an admin
`MATRIX_BOT_TOKEN`, as canopy listing does; without them, or when the
homeserver cannot be read, nobody is a moderator and joining an unlocked room
still works. Record: O4 in
[`docs/security/capability-header-triage-2026-10-23.md`](../../docs/security/capability-header-triage-2026-10-23.md).

### Deployment modes

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` to use either:

1. **Self-hosted LiveKit server** (`wss://your-livekit-host`), or
2. **LiveKit Cloud** URL/API credentials.
