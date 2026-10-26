/**
 * What a voice-room mute or removal does in LiveKit (V4 in
 * `docs/security/capability-header-triage-2026-10-23.md`).
 *
 * Until 2026-10-25 `mute` and `remove` (`routes/voice.ts`) only wrote records
 * in the API: the person stayed connected and could still speak, and a token
 * already minted kept its role for up to 15 minutes. Moderation now reaches
 * the call through LiveKit's room service (`livekit-server-sdk`,
 * `RoomServiceClient`), the client the OBS mute path already uses
 * (`livekitAdmin.ts`), behind the same injectable factory, so tests run a fake
 * that records the calls:
 *
 *   - a mute mutes every audio track the participant has published
 *     (`mutePublishedTrack`) and takes away their permission to publish in
 *     the room (`updateParticipant`), so that the mute does not rest on the
 *     track mute alone; an unmute gives both back;
 *   - a removal disconnects the participant (`removeParticipant`). It does not
 *     revoke a token the participant already holds (`services/livekit.ts`).
 *
 * The LiveKit identity is the Blackout user id, as the tokens are minted. A
 * participant who is not connected is not an error: the route writes its
 * record before calling here, and that record decides the account's next
 * token. When LiveKit is not configured nothing is attempted; when it is and
 * the call fails, the outcome says so and the route answers 502 with what
 * stands. The route checks the configuration before it writes anything, so a
 * 503 means nothing was done.
 */
import {
    TrackType,
    TwirpError,
    type ParticipantInfo,
    type ParticipantPermission,
} from 'livekit-server-sdk';
import { isLiveKitConfigured } from './livekit';
import { getRoomServiceClient, type RoomServiceClientLike } from './livekitAdmin';
import { log } from '../telemetry/logger';

export type LiveKitModerationFailure = 'livekit_not_configured' | 'livekit_unavailable';

export type LiveKitMuteOutcome =
    | { ok: true; connected: true; mutedTrackSids: string[] }
    | { ok: true; connected: false }
    | { ok: false; reason: LiveKitModerationFailure; detail?: string };

export type LiveKitRemoveOutcome =
    | { ok: true; disconnected: boolean }
    | { ok: false; reason: LiveKitModerationFailure; detail?: string };

/** LiveKit's answer for a room, participant or track that is not there (Twirp `not_found`, HTTP 404). */
const isNotFound = (error: unknown): boolean =>
    error instanceof TwirpError && (error.status === 404 || error.code === 'not_found');

const unavailable = (
    action: string,
    roomName: string,
    identity: string,
    error: unknown
): { ok: false; reason: 'livekit_unavailable'; detail: string } => {
    const detail = error instanceof Error ? error.message : String(error);
    log.warn('voice_moderation_livekit_failed', {
        action,
        room: roomName,
        identity,
        error: detail,
    });
    return { ok: false, reason: 'livekit_unavailable', detail };
};

/**
 * The participant's permissions with `canPublish` replaced. `updateParticipant`
 * replaces the permission set as a whole, so every other field is carried over
 * from what LiveKit reports for the participant; the fallback (never needed for
 * a connected participant) is what the API's tokens grant.
 */
const withCanPublish = (
    current: ParticipantPermission | undefined,
    canPublish: boolean
): Partial<ParticipantPermission> => ({
    canSubscribe: true,
    canPublishData: true,
    ...(current ?? {}),
    canPublish,
});

const findParticipant = async (
    client: RoomServiceClientLike,
    roomName: string,
    identity: string
): Promise<ParticipantInfo | undefined> =>
    (await client.listParticipants(roomName)).find((p) => p.identity === identity);

/**
 * Mute (`muted`) or unmute the participant `identity` in the LiveKit room
 * `roomName`: every published audio track, and the permission to publish.
 * `canPublishWhenUnmuted` is what an unmute restores (what the participant
 * joined with); a mute always takes publishing away.
 */
export async function muteParticipantInLiveKit(
    roomName: string,
    identity: string,
    muted: boolean,
    canPublishWhenUnmuted: boolean
): Promise<LiveKitMuteOutcome> {
    if (!isLiveKitConfigured()) return { ok: false, reason: 'livekit_not_configured' };
    const action = muted ? 'mute' : 'unmute';
    const client = getRoomServiceClient();

    let participant: ParticipantInfo | undefined;
    try {
        participant = await findParticipant(client, roomName, identity);
    } catch (error) {
        return unavailable(action, roomName, identity, error);
    }
    if (!participant) return { ok: true, connected: false };

    const audioTracks = participant.tracks.filter((track) => track.type === TrackType.AUDIO);
    const permission = withCanPublish(
        participant.permission,
        muted ? false : canPublishWhenUnmuted
    );
    const mutedTrackSids: string[] = [];
    try {
        // Muting: the tracks first, while they are still published, then the
        // permission. Unmuting: the permission first, then whichever tracks are
        // still there (LiveKit may unpublish a track when publishing is taken
        // away; a track that is gone by now is not an error). A participant who
        // left meanwhile is simply not connected.
        if (!muted) await client.updateParticipant(roomName, identity, { permission });
        for (const track of audioTracks) {
            try {
                await client.mutePublishedTrack(roomName, identity, track.sid, muted);
                mutedTrackSids.push(track.sid);
            } catch (error) {
                if (!isNotFound(error)) throw error;
            }
        }
        if (muted) await client.updateParticipant(roomName, identity, { permission });
    } catch (error) {
        if (isNotFound(error)) return { ok: true, connected: false };
        return unavailable(action, roomName, identity, error);
    }
    return { ok: true, connected: true, mutedTrackSids };
}

/** Disconnect the participant `identity` from the LiveKit room `roomName`. */
export async function removeParticipantFromLiveKit(
    roomName: string,
    identity: string
): Promise<LiveKitRemoveOutcome> {
    if (!isLiveKitConfigured()) return { ok: false, reason: 'livekit_not_configured' };
    try {
        await getRoomServiceClient().removeParticipant(roomName, identity);
        return { ok: true, disconnected: true };
    } catch (error) {
        // The room has no such participant (or does not exist): nobody to disconnect.
        if (isNotFound(error)) return { ok: true, disconnected: false };
        return unavailable('remove', roomName, identity, error);
    }
}
