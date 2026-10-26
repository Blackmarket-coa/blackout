/**
 * A stand-in for LiveKit's room service, for tests of voice-room moderation.
 *
 * It implements the calls `services/livekitAdmin.ts` takes from the SDK's
 * `RoomServiceClient` (`RoomServiceClientLike`) and records every one in
 * `calls`. `rooms` holds who is connected to each LiveKit room, as the SDK's
 * own protocol classes, so the code under test reads them exactly as it would
 * read LiveKit's answer; `connect` adds a participant with published tracks.
 * A participant or track that is not there is answered as LiveKit answers it:
 * a `TwirpError` with HTTP 404 and code `not_found`. Set `failure` to make
 * every call throw it (LiveKit down).
 *
 * Inject it with `setRoomServiceClientFactory(() => stub.client)`.
 */
import {
    ParticipantInfo,
    ParticipantPermission,
    TrackInfo,
    TrackSource,
    TrackType,
    TwirpError,
    type UpdateParticipantOptions,
} from 'livekit-server-sdk';
import type { RoomServiceClientLike } from '../../src/services/livekitAdmin';

export type LiveKitCall =
    | { method: 'listParticipants'; room: string }
    | {
          method: 'mutePublishedTrack';
          room: string;
          identity: string;
          trackSid: string;
          muted: boolean;
      }
    | {
          method: 'updateParticipant';
          room: string;
          identity: string;
          /** The three grants the API's tokens carry, as the call set them. */
          permission: { canPublish: boolean; canSubscribe: boolean; canPublishData: boolean };
      }
    | { method: 'removeParticipant'; room: string; identity: string };

export interface StubTrack {
    sid: string;
    kind: 'audio' | 'video';
}

export interface LiveKitStub {
    rooms: Map<string, ParticipantInfo[]>;
    calls: LiveKitCall[];
    /** When set, every call throws it. */
    failure: Error | null;
    client: RoomServiceClientLike;
    /** Connect `identity` to `room` with these published tracks (as the API's token grants them). */
    connect(
        room: string,
        identity: string,
        tracks: StubTrack[],
        permission?: { canPublish?: boolean; canSubscribe?: boolean }
    ): ParticipantInfo;
    participant(room: string, identity: string): ParticipantInfo | undefined;
    clearCalls(): void;
}

const notFound = (what: string): TwirpError =>
    new TwirpError('Not Found', `${what} does not exist`, 404, 'not_found');

export function createLiveKitStub(): LiveKitStub {
    const stub: LiveKitStub = {
        rooms: new Map(),
        calls: [],
        failure: null,
        client: undefined as unknown as RoomServiceClientLike,
        connect(room, identity, tracks, permission = {}) {
            const info = new ParticipantInfo({
                sid: `PA_${identity.slice(0, 8)}`,
                identity,
                name: identity,
                tracks: tracks.map(
                    (track) =>
                        new TrackInfo({
                            sid: track.sid,
                            type: track.kind === 'audio' ? TrackType.AUDIO : TrackType.VIDEO,
                            source:
                                track.kind === 'audio'
                                    ? TrackSource.MICROPHONE
                                    : TrackSource.CAMERA,
                            muted: false,
                        })
                ),
                permission: new ParticipantPermission({
                    canPublish: permission.canPublish ?? true,
                    canSubscribe: permission.canSubscribe ?? true,
                    canPublishData: true,
                }),
            });
            const others = (stub.rooms.get(room) ?? []).filter((p) => p.identity !== identity);
            stub.rooms.set(room, [...others, info]);
            return info;
        },
        participant: (room, identity) => stub.rooms.get(room)?.find((p) => p.identity === identity),
        clearCalls() {
            stub.calls.length = 0;
        },
    };

    const failing = (): void => {
        if (stub.failure) throw stub.failure;
    };

    stub.client = {
        async listParticipants(room) {
            failing();
            stub.calls.push({ method: 'listParticipants', room });
            return [...(stub.rooms.get(room) ?? [])];
        },
        async mutePublishedTrack(room, identity, trackSid, muted) {
            failing();
            stub.calls.push({ method: 'mutePublishedTrack', room, identity, trackSid, muted });
            const participant = stub.participant(room, identity);
            if (!participant) throw notFound('participant');
            const track = participant.tracks.find((t) => t.sid === trackSid);
            if (!track) throw notFound('track');
            track.muted = muted;
            return track;
        },
        async updateParticipant(
            room: string,
            identity: string,
            options?: UpdateParticipantOptions | string,
            permission?: Partial<ParticipantPermission>
        ) {
            failing();
            const wanted = typeof options === 'object' ? options.permission : permission;
            const participant = stub.participant(room, identity);
            stub.calls.push({
                method: 'updateParticipant',
                room,
                identity,
                permission: {
                    canPublish: Boolean(wanted?.canPublish),
                    canSubscribe: Boolean(wanted?.canSubscribe),
                    canPublishData: Boolean(wanted?.canPublishData),
                },
            });
            if (!participant) throw notFound('participant');
            if (wanted) participant.permission = new ParticipantPermission(wanted);
            return participant;
        },
        async removeParticipant(room, identity) {
            failing();
            stub.calls.push({ method: 'removeParticipant', room, identity });
            const participants = stub.rooms.get(room);
            if (!participants?.some((p) => p.identity === identity)) {
                throw notFound('participant');
            }
            stub.rooms.set(
                room,
                participants.filter((p) => p.identity !== identity)
            );
        },
    };

    return stub;
}
