# @blackout/server

This workspace lives at `packages/api` and is the canonical server runtime target.

- **Workspace path:** `packages/api`
- **Package name:** `@blackout/server`

Use `@blackout/server` in workspace filters and dependency declarations.

## Persistence

The default runtime uses a JSON-backed store (`FileBackedDb` in
`src/db/store.ts`) controlled by two env vars:

- `BLACKOUT_DB_MODE` — `file` (default, persistent) or `memory` (tests only).
- `BLACKOUT_DB_FILE` — path to the store file. Default resolves to
  `./.blackout/data/store.json` relative to the process cwd.

The default path is fine for local dev. In a container the cwd is inside
the image filesystem, so the file is wiped on every container recreate.
For production deploys set `BLACKOUT_DB_FILE=/data/blackout/store.json`
and mount a named volume on `/data/blackout` — otherwise invitations,
accounts, and everything else in the store will disappear the next time
`docker compose up -d` recreates the api service.

### Single-writer requirement for the JSON store

`FileBackedDb` hydrates from disk **once** at process start and then
overwrites the entire file on every mutation with its in-memory
snapshot. There is no merge step. Running a second Node process (for
example `scripts/bootstrap-admin.ts`) against the same store file
while the api is live silently loses one side's writes: whichever
process calls `persist()` last wins.

If you need to seed data with a one-off script, stop the api first:

```
sudo docker compose stop api
sudo docker compose run --rm \
  -w /app/packages/api \
  -e BU=<username> -e BE=<email> -e BP=<password> \
  api pnpm exec tsx scripts/bootstrap-admin.ts
sudo docker compose up -d api
```

The api now starts with the seeded state in its in-memory map and
won't overwrite it on the next mutation.

## Voice rooms (LiveKit)

The API exposes a LiveKit-compatible voice room lifecycle under `/v1/voice`.

- `POST /voice/rooms/create` — create or rehydrate a canopy/channel room (`canopy_voice_rooms` backing model).
- `POST /voice/rooms/join` — join room + mint short-lived LiveKit token (default TTL 300s).
- `POST /voice/token` — mint token only, with role-based publish/subscribe grants.
- `POST /voice/rooms/leave` — leave room and log duration.
- `POST /voice/rooms/moderation/mute|remove|lock` — moderation controls for canopy admins/mods.
- `GET /voice/rooms/:canopyId/:channelId/events` — room event feed (join/leave/moderation analytics).

### Deployment modes

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` to use either:

1. **Self-hosted LiveKit server** (`wss://your-livekit-host`), or
2. **LiveKit Cloud** URL/API credentials.
