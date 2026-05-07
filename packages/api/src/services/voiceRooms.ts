import { db } from '../db/store';
import type { CanopyVoiceRoomRecord } from '../db/types';

/**
 * Find the creator's currently-active LiveKit voice room.
 *
 * The OBS-WS shim's mute path needs this to know which LiveKit room to
 * issue admin actions against. A creator may own multiple voice rooms
 * (e.g. one per canopy or channel they moderate); we return the
 * most-recently-updated active row so a creator who hops between
 * canopies during a stream still has their mic toggle target the room
 * they're currently active in.
 *
 * Returns null when the creator has no active voice room — the caller
 * should treat this as `NoActiveVoiceRoom 409` rather than a generic
 * failure so a creator who hasn't joined a voice channel yet sees a
 * clear error from their Stream Deck.
 */
export const findActiveVoiceRoomForUser = (
  userId: string,
): CanopyVoiceRoomRecord | null => {
  let best: CanopyVoiceRoomRecord | null = null;
  for (const room of db.canopyVoiceRooms.values()) {
    if (!room.active) continue;
    if (room.createdBy !== userId) continue;
    if (!best || Date.parse(room.updatedAt) > Date.parse(best.updatedAt)) {
      best = room;
    }
  }
  return best;
};
