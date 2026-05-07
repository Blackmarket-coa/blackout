import { RoomServiceClient, type ParticipantInfo, TrackSource } from 'livekit-server-sdk';

import { getLiveKitConfig } from './livekit';
import { findActiveVoiceRoomForUser } from './voiceRooms';
import { log } from '../telemetry/logger';

/**
 * Admin-token LiveKit operations the OBS-WS shim's mute path needs.
 *
 * The plain `services/livekit.ts` only signs CLIENT tokens (a creator
 * joining their own voice room). To mute someone you need a server-
 * authenticated call against LiveKit's RoomService API — the
 * `@livekit/server-sdk` `RoomServiceClient` handles the signing.
 *
 * The factory pattern (`setRoomServiceClientFactory`) mirrors
 * `services/rtmpFanoutWorker.ts` ProcessFactory: tests inject a stub
 * with no LiveKit network round-trips, prod uses the singleton
 * created lazily from env.
 */

export type RoomServiceClientLike = Pick<
  RoomServiceClient,
  'listParticipants' | 'mutePublishedTrack'
>;

type Factory = () => RoomServiceClientLike;

let factory: Factory | undefined;
let cached: RoomServiceClientLike | undefined;

export const setRoomServiceClientFactory = (f: Factory | undefined): void => {
  factory = f;
  cached = undefined;
};

const defaultFactory: Factory = () => {
  const config = getLiveKitConfig();
  return new RoomServiceClient(config.url, config.apiKey, config.apiSecret);
};

const getClient = (): RoomServiceClientLike => {
  if (cached) return cached;
  cached = (factory ?? defaultFactory)();
  return cached;
};

/**
 * The set of OBS input names whose `SetInputMute` request we route
 * through to LiveKit. Anything else returns NotImplemented (204) per
 * the OBS-WS shim's existing fallthrough so other inputs (display
 * captures, app captures) just no-op.
 */
export const MIC_INPUT_NAMES = new Set(['Mic', 'Microphone', 'Desktop Audio']);

interface CachedTrackEntry {
  trackSid: string;
  expiresAtMs: number;
}

const TRACK_CACHE_TTL_MS = 30_000;
const trackCache = new Map<string, CachedTrackEntry>();

const cacheKey = (room: string, identity: string): string => `${room}:${identity}`;

const findMicTrackSid = async (
  client: RoomServiceClientLike,
  room: string,
  identity: string,
): Promise<string | null> => {
  const key = cacheKey(room, identity);
  const cached = trackCache.get(key);
  if (cached && cached.expiresAtMs > Date.now()) return cached.trackSid;

  const participants: ParticipantInfo[] = await client.listParticipants(room);
  const me = participants.find((p) => p.identity === identity);
  if (!me) return null;
  const micTrack = me.tracks.find((t) => t.source === TrackSource.MICROPHONE);
  if (!micTrack) return null;
  trackCache.set(key, {
    trackSid: micTrack.sid,
    expiresAtMs: Date.now() + TRACK_CACHE_TTL_MS,
  });
  return micTrack.sid;
};

export type MuteOutcome =
  | { kind: 'ok'; muted: boolean }
  | { kind: 'unknown_input' }
  | { kind: 'no_active_voice_room' }
  | { kind: 'no_publish_track' };

export const setInputMute = async (
  userId: string,
  inputName: string,
  muted: boolean,
): Promise<MuteOutcome> => {
  if (!MIC_INPUT_NAMES.has(inputName)) return { kind: 'unknown_input' };
  const room = findActiveVoiceRoomForUser(userId);
  if (!room) return { kind: 'no_active_voice_room' };
  const client = getClient();
  const trackSid = await findMicTrackSid(client, room.livekitRoomName, userId);
  if (!trackSid) return { kind: 'no_publish_track' };
  try {
    await client.mutePublishedTrack(room.livekitRoomName, userId, trackSid, muted);
    return { kind: 'ok', muted };
  } catch (err) {
    log.warn('livekit_mute_track_failed', {
      room: room.livekitRoomName,
      userId,
      muted,
      error: String(err),
    });
    return { kind: 'no_publish_track' };
  }
};

export const getInputMute = async (
  userId: string,
  inputName: string,
): Promise<MuteOutcome> => {
  if (!MIC_INPUT_NAMES.has(inputName)) return { kind: 'unknown_input' };
  const room = findActiveVoiceRoomForUser(userId);
  if (!room) return { kind: 'no_active_voice_room' };
  const client = getClient();
  const participants = await client.listParticipants(room.livekitRoomName);
  const me = participants.find((p) => p.identity === userId);
  if (!me) return { kind: 'no_publish_track' };
  const micTrack = me.tracks.find((t) => t.source === TrackSource.MICROPHONE);
  if (!micTrack) return { kind: 'no_publish_track' };
  return { kind: 'ok', muted: micTrack.muted };
};

export const toggleInputMute = async (
  userId: string,
  inputName: string,
): Promise<MuteOutcome> => {
  const current = await getInputMute(userId, inputName);
  if (current.kind !== 'ok') return current;
  return setInputMute(userId, inputName, !current.muted);
};

/** Reset both factory + cache. Tests use this between cases. */
export const __test__ = {
  resetCacheAndFactory: () => {
    trackCache.clear();
    factory = undefined;
    cached = undefined;
  },
};
