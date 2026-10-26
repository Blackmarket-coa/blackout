# @blackout/server

This workspace lives at `packages/api` and is the canonical server runtime target.

-   **Workspace path:** `packages/api`
-   **Package name:** `@blackout/server`

Use `@blackout/server` in workspace filters and dependency declarations.

## Tests

-   `pnpm --filter @blackout/api test:integration` runs `test/**/*.integration.test.ts`.
    It is the PR gate (the `API smoke + integration` CI job).
-   `pnpm --filter @blackout/api test` runs every `test/**/*.test.ts` file, the
    PGlite Postgres tests included, one file at a time. Turborepo CI runs it on
    every push to `develop`.

`test` passes `--test-force-exit`, which ends each file's process as soon as its
tests finish. On its own, that let a file's last results go unreported: they
were still queued on the pipe to the runner when the process exited, and the
suite then printed fewer tests with `fail 0`. A failure among them was never
seen. `test/_setup/blocking-stdio.mjs`, loaded with `--import`, makes those
writes blocking, and `test/test-runner-flush.test.ts` keeps it in place. If a
run's total looks short, compare the reported test names with a run of
`develop`; don't take `fail 0` alone.

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
-   `POST /voice/rooms/join` — join an existing room + mint a LiveKit token that lives 120 s (`LIVEKIT_TOKEN_TTL_SECONDS` in `src/services/livekit.ts`; not configurable, and `ttlSeconds` in the request is ignored). Joining does not create a room. The canopy decides who enters: an account it banned is refused (403 `canopy_banned`), an outsider gets in only where the canopy is public (403 `not_canopy_member` otherwise), an account a moderator removed not at all until readmitted (403 `removed_from_room`); a locked room admits moderators and admins only (423 `room_locked` for members).
-   `POST /voice/token` — mint a token only, for an existing room, under the same entry, removal and lock checks; a standing mute makes the token unable to publish. It does not check the premium subscription that joining does (V5 in the record below, the operator's billing decision).
-   `POST /voice/rooms/leave` — leave room and log duration.
-   `POST /voice/rooms/moderation/lock|mute|remove|readmit` — for the canopy's moderators and admins. `mute` (`muted: false` to unmute), `remove` and `readmit` name a `targetUserId` whose level must be below the moderator's (403 `target_not_below_moderator`; 404 `target_unknown` for an id with no account). Mute mutes the target's published audio tracks in LiveKit and takes away their permission to publish; remove disconnects them. Both are recorded first and outlive the connection: a removed account gets no new token for the room until readmitted, and a muted one's new tokens cannot publish. Tokens already issued are not revoked (the API's live 120 s; LiveKit can refresh a connected client's token), so a removed account's client that kept one can rejoin until it expires (`KNOWN_LIMITATIONS.md`). Without LiveKit configured they do nothing and answer 503 `livekit_not_configured`; if LiveKit fails, the record stands and the answer is 502 `livekit_unavailable`, saying so. Lock refuses new joins and tokens; it does not end connections already made.
-   `GET /voice/rooms/:canopyId/:channelId/events` — who is in the room, its join/leave/moderation history and the mutes and removals that stand, for joined members of the canopy (403 `forbidden` otherwise, with the same body for a room that does not exist).

A caller's role (`member`, `moderator`, `admin`) and whether the canopy admits
them at all come from the canopy's state on the homeserver
(`src/services/voiceRoleGate.ts`), never from the request: `admin` at the level
needed to change `m.room.power_levels`, `moderator` at the canopy's `kick`
level, `member` otherwise; refused when banned, and when not a member of a
canopy that is not public. A `role` in the request body is ignored. The check
needs `MATRIX_HOMESERVER` and an admin `MATRIX_BOT_TOKEN`, as canopy listing
does; without them, or when the homeserver cannot be read, nobody is a
moderator, the ban and membership checks cannot run, and joining an unlocked
room still works (`KNOWN_LIMITATIONS.md`, "Voice rooms in the API"). Moderation
needs `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Record: O4 and
V1 to V7 in
[`docs/security/capability-header-triage-2026-10-23.md`](../../docs/security/capability-header-triage-2026-10-23.md).

### Deployment modes

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` to use either:

1. **Self-hosted LiveKit server** (`wss://your-livekit-host`), or
2. **LiveKit Cloud** URL/API credentials.
