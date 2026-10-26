/**
 * LiveKit's webhook: a mute or a removal that stands is applied when LiveKit
 * reports the person in the room (V4's residual in
 * `docs/security/capability-header-triage-2026-10-23.md`).
 *
 * LiveKit cannot revoke a token. A removed participant whose client kept a
 * valid one, the API's (two minutes) or one LiveKit's server gave it while it
 * was connected (ten minutes, renewed every five: `services/livekit.ts`), can
 * connect to the room again until it expires, and a muted one can reconnect
 * with a token issued before the mute and publish. The API cannot stop that
 * connection being made; it can end it. With the LiveKit server's
 * `webhook.urls` pointing at `POST /v1/voice/livekit/webhook`
 * (`routes/livekitWebhook.ts`), LiveKit posts `participant_joined` once a
 * participant is connected and `track_published` each time one publishes a
 * track. In a room the API created, the API then applies what stands against
 * the participant's identity (the Blackout user id, as the API mints tokens)
 * through the moderation route's own calls (`voiceModeration.ts`): a removal
 * disconnects them; a mute mutes their audio tracks and takes publishing away,
 * and LiveKit then unpublishes their tracks and refuses new ones.
 *
 * What a delivery can do: nothing is read from it before it verifies
 * (`verifyLiveKitWebhook`), and even then it only names a room and an identity.
 * What is applied is what the API's own records say stands at that moment, so
 * no delivery creates, lifts or widens a sanction. A replayed one, or one forged
 * by a holder of the API secret (who could call LiveKit's room service directly
 * anyway), can at most make the API apply a moderator's decision again, and a
 * repeat of a delivery the API already acted on is answered without acting.
 */
import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';
import { db } from '../db/store';
import type { CanopyVoiceRoomRecord, VoiceRoomSanctionRecord } from '../db/types';
import { getLiveKitConfig } from './livekit';
import {
    muteParticipantInLiveKit,
    removeParticipantFromLiveKit,
    type LiveKitModerationFailure,
} from './voiceModeration';
import { log } from '../telemetry/logger';

export type LiveKitWebhookVerification =
    | { ok: true; event: WebhookEvent }
    | { ok: false; reason: string };

/**
 * Verify a delivery with the SDK's `WebhookReceiver`, under the API key and
 * secret the API uses for LiveKit. `authorization` must be a JWT signed with the
 * secret (HS256), issued by the key (`iss`), inside its `nbf` to `exp` window
 * (the verifier allows ten seconds of clock skew), whose `sha256` claim is the
 * base64 SHA-256 of `rawBody` exactly as received; only then is the body
 * parsed. LiveKit signs each delivery with `nbf` now and `exp` five minutes on,
 * and no `iat`, so a captured delivery verifies, unchanged, for five minutes.
 */
export async function verifyLiveKitWebhook(
    rawBody: string,
    authorization: string | undefined
): Promise<LiveKitWebhookVerification> {
    const { apiKey, apiSecret } = getLiveKitConfig();
    try {
        // The third argument is the SDK's `skipAuth`, its switch for not verifying.
        const event = await new WebhookReceiver(apiKey, apiSecret).receive(
            rawBody,
            authorization,
            false
        );
        return { ok: true, event };
    } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
}

/** What LiveKit reports that the API acts on: someone connected, or publishing. */
const ENFORCED_ON: ReadonlySet<string> = new Set(['participant_joined', 'track_published']);

/**
 * LiveKit event ids (`EV_…`, inside the signed body) of deliveries the API acted
 * on, for six minutes: longer than a delivery verifies (five minutes, and the
 * verifier's ten seconds), so a repeat, LiveKit retrying a delivery whose
 * answer it did not get or a copy replayed, is answered without acting again.
 * Only deliveries that applied a sanction are kept. Per process: a repeat that
 * reaches another replica applies the standing sanction again, as any new
 * report of the same person would.
 */
const HANDLED_TTL_MS = 6 * 60 * 1000;
const MAX_HANDLED = 10_000;
const handled = new Map<string, number>();

const alreadyHandled = (eventId: string, now: number): boolean => {
    // Entries are added in the order they expire: drop expired ones from the front.
    for (const [id, expiresAt] of handled) {
        if (expiresAt > now) break;
        handled.delete(id);
    }
    return handled.has(eventId);
};

const markHandled = (eventId: string, now: number): void => {
    handled.set(eventId, now + HANDLED_TTL_MS);
    if (handled.size > MAX_HANDLED) handled.delete(handled.keys().next().value as string);
};

interface Standing {
    room: CanopyVoiceRoomRecord;
    sanction: VoiceRoomSanctionRecord;
}

/**
 * What stands against `identity` in the API's voice room behind the LiveKit room
 * `roomName`, a removal before a mute; `undefined` for a room the API did not
 * create (a MatrixRTC call on the same LiveKit server, say) and for anyone
 * nothing stands against. Every room with that LiveKit name is looked at,
 * though names are built from the canopy and the channel and should not repeat.
 */
const standingSanction = (roomName: string, identity: string): Standing | undefined => {
    const rooms = [...db.canopyVoiceRooms.values()].filter(
        (room) => room.active && room.livekitRoomName === roomName
    );
    for (const kind of ['remove', 'mute'] as const) {
        for (const room of rooms) {
            const sanction = db.getActiveVoiceRoomSanction(room.id, identity, kind);
            if (sanction) return { room, sanction };
        }
    }
    return undefined;
};

/** What happened in LiveKit, in the words the moderation route logs. */
export type LiveKitEnforcement = 'disconnected' | 'applied' | 'not_connected';

export type LiveKitWebhookOutcome =
    | {
          status: 200;
          body:
              | { ok: true; enforced: null; duplicate?: true }
              | { ok: true; enforced: 'remove' | 'mute'; livekit: LiveKitEnforcement };
      }
    | { status: 502 | 503; body: { code: LiveKitModerationFailure; message: string } };

const NOTHING_TO_DO: LiveKitWebhookOutcome = { status: 200, body: { ok: true, enforced: null } };

/**
 * Act on a verified delivery. On `participant_joined` or `track_published` in a
 * room the API created, apply the sanction that stands against the participant,
 * and log it in the room's event log as the moderation route logs its actions,
 * under the moderator who imposed it. Anything else is answered 200 and left
 * alone. When LiveKit does not carry the action out the answer is 502 and the
 * delivery is not marked handled, so LiveKit's retry of it tries again.
 */
export async function handleLiveKitWebhookEvent(
    event: WebhookEvent
): Promise<LiveKitWebhookOutcome> {
    if (!ENFORCED_ON.has(event.event)) return NOTHING_TO_DO;
    const roomName = event.room?.name;
    const identity = event.participant?.identity;
    if (!roomName || !identity) return NOTHING_TO_DO;

    const standing = standingSanction(roomName, identity);
    if (!standing) return NOTHING_TO_DO;
    const { room, sanction } = standing;

    // Someone LiveKit already holds unable to publish is muted already: a token
    // the API minted after the mute connects that way. Only `participant_joined`
    // carries the permission; a `track_published` means they could publish.
    if (sanction.kind === 'mute' && event.participant?.permission?.canPublish === false) {
        return NOTHING_TO_DO;
    }

    const now = Date.now();
    if (event.id && alreadyHandled(event.id, now)) {
        return { status: 200, body: { ok: true, enforced: null, duplicate: true } };
    }

    let livekit: LiveKitEnforcement | LiveKitModerationFailure;
    if (sanction.kind === 'remove') {
        const outcome = await removeParticipantFromLiveKit(room.livekitRoomName, identity);
        livekit = outcome.ok
            ? outcome.disconnected
                ? 'disconnected'
                : 'not_connected'
            : outcome.reason;
    } else {
        // Muting: the last argument, what an unmute would restore, is not used.
        const outcome = await muteParticipantInLiveKit(room.livekitRoomName, identity, true, false);
        livekit = outcome.ok ? (outcome.connected ? 'applied' : 'not_connected') : outcome.reason;
    }

    db.logVoiceRoomEvent({
        roomId: room.id,
        canopyId: room.canopyId,
        channelId: room.channelId,
        // As the moderation route logs it: whose decision this is, and on whom.
        userId: sanction.actorId,
        actorId: sanction.actorId,
        targetUserId: identity,
        eventType: sanction.kind,
        metadata: {
            enforcedOn: event.event,
            sanctionId: sanction.id,
            livekitEventId: event.id,
            livekit,
        },
    });

    if (livekit === 'livekit_unavailable' || livekit === 'livekit_not_configured') {
        log.warn('voice_sanction_not_enforced', {
            roomId: room.id,
            userId: identity,
            kind: sanction.kind,
            on: event.event,
            reason: livekit,
        });
        return {
            status: livekit === 'livekit_not_configured' ? 503 : 502,
            body: {
                code: livekit,
                message: `LiveKit did not carry out the ${sanction.kind} that stands.`,
            },
        };
    }

    if (event.id) markHandled(event.id, now);
    log.info('voice_sanction_enforced', {
        roomId: room.id,
        userId: identity,
        kind: sanction.kind,
        on: event.event,
        livekit,
    });
    return { status: 200, body: { ok: true, enforced: sanction.kind, livekit } };
}
