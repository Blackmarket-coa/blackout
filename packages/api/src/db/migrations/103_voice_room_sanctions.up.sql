-- Mutes and removals a moderator imposed on an account in one voice room.
--
-- Until 2026-10-25 a voice-room mute or removal was only an entry in the event
-- log: the person stayed connected, and could come straight back with a new
-- token. A sanction now outlives the connection it was imposed on: while a
-- removal stands the account gets no token for the room and does not join it,
-- and while a mute stands its tokens cannot publish. A moderator lifts it
-- (lifted_at, lifted_by), and lifted rows stay as history. The row is keyed by
-- the voice room (canopy_voice_rooms.id), so it ends with the room. See
-- applyVoiceRoomSanction in packages/api/src/db/store.ts and V4 in
-- docs/security/capability-header-triage-2026-10-23.md.
--
-- Without this table the Postgres-backed store would hold the sanction in
-- memory only and forget it on restart, letting a removed account back in.
CREATE TABLE IF NOT EXISTS voice_room_sanctions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind VARCHAR(16) NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  lifted_at TIMESTAMPTZ,
  lifted_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_voice_room_sanctions_room ON voice_room_sanctions (room_id);
