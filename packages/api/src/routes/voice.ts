import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import { createLiveKitAccessToken, getLiveKitConfig, type VoiceRole } from '../services/livekit';
import { hasPremiumCanopyEntitlement } from '../services/subscriptions';
import { hasCanopy } from '../services/canopyDirectory';
import {
    readVoiceRole,
    voiceRoleRefusalResponse,
    type VoiceRoleRefusal,
    type VoiceRoleVerdict,
} from '../services/voiceRoleGate';

// The caller's role comes from the canopy's power levels on the homeserver
// (`services/voiceRoleGate.ts`), never from the request. A `role` in the body
// is not read: these schemas drop it like any other unknown key, so a client
// that still sends one is not refused, and gets the role the homeserver gives.
const roomCoordsSchema = z.object({
    canopyId: z.string().trim().min(1),
    channelId: z.string().trim().min(1),
});

const joinRoomSchema = roomCoordsSchema.extend({
    canPublish: z.boolean().optional(),
    canSubscribe: z.boolean().optional(),
});

const tokenSchema = roomCoordsSchema.extend({
    canPublish: z.boolean().optional(),
    canSubscribe: z.boolean().optional(),
    ttlSeconds: z.number().optional(),
});

const moderationSchema = roomCoordsSchema.extend({
    targetUserId: z.string().trim().optional(),
    locked: z.boolean().optional(),
});

function canModerate(role: VoiceRole): boolean {
    return role === 'admin' || role === 'moderator';
}

const refuse = (c: Context, reason: VoiceRoleRefusal): Response => {
    const { status, body } = voiceRoleRefusalResponse(reason);
    return c.json(body, status);
};

/**
 * The caller's role where the route still serves a member (joining, a token):
 * when the homeserver could not answer, no elevated role.
 */
const roleOrMember = (verdict: VoiceRoleVerdict): VoiceRole =>
    verdict.ok ? verdict.role : 'member';

/**
 * A locked room refuses a member with 423. When the homeserver could not say
 * whether the caller is more than a member, the refusal says that instead, so a
 * moderator is not told the room is simply locked.
 */
const lockedRoomRefusal = (c: Context, verdict: VoiceRoleVerdict): Response =>
    verdict.ok
        ? c.json({ code: 'room_locked', message: 'Room is locked' }, 423)
        : refuse(c, verdict.reason);

function roomName(canopyId: string, channelId: string): string {
    return `canopy-${canopyId}-channel-${channelId}`;
}

const voice = new Hono();

voice.get('/config', (c) => {
    const config = getLiveKitConfig();
    return c.json({ url: config.url, tokenTtlSeconds: config.tokenTtlSeconds });
});

/**
 * Open voice rooms, for drop-in.
 *
 * A "third place" only works if you can see who is already there, so this lists
 * unlocked, currently-active rooms with a live participant count rather than
 * requiring an invitation or a room id known in advance. Locked rooms are
 * excluded: their whole point is not being dropped into.
 */
voice.get('/rooms/open', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const participantsByRoom = new Map<string, number>();
    for (const participant of db.voiceRoomParticipants.values()) {
        // `leftAt` is stamped on leave; rows are kept for the event history.
        if (participant.leftAt) continue;
        participantsByRoom.set(
            participant.roomId,
            (participantsByRoom.get(participant.roomId) ?? 0) + 1
        );
    }

    const rooms = [...db.canopyVoiceRooms.values()]
        .filter((room) => room.active && !room.isLocked)
        .map((room) => ({
            roomId: room.id,
            canopyId: room.canopyId,
            channelId: room.channelId,
            participantCount: participantsByRoom.get(room.id) ?? 0,
            startedAt: room.createdAt,
        }))
        // Busiest first: an empty room is the hardest one to walk into, so a
        // newcomer is shown the ones with people in them. This orders a directory,
        // not a feed — nothing is hidden, and the count is the whole ranking.
        .sort((a, b) => b.participantCount - a.participantCount);

    return c.json({ rooms });
});

voice.post('/rooms/create', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, roomCoordsSchema);
    if (parsed instanceof Response) return parsed;
    const { canopyId, channelId } = parsed;

    if (!hasCanopy(canopyId)) {
        return c.json(
            { code: 'unknown_canopy', message: 'Canopy is not registered', canopyId },
            404
        );
    }

    if (!hasPremiumCanopyEntitlement(user.sub)) {
        return c.json(
            { code: 'premium_required', message: 'Premium canopy subscription required' },
            402
        );
    }

    const verdict = await readVoiceRole(user.sub, canopyId);
    if (!verdict.ok) return refuse(c, verdict.reason);
    if (!canModerate(verdict.role)) return refuse(c, 'not_canopy_moderator');

    const room = db.createOrUpdateVoiceRoom({
        canopyId,
        channelId,
        createdBy: user.sub,
        livekitRoomName: roomName(canopyId, channelId),
    });

    return c.json({ room }, 201);
});

voice.post('/rooms/join', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, joinRoomSchema);
    if (parsed instanceof Response) return parsed;
    const { canopyId, channelId } = parsed;
    const requestedCanPublish = parsed.canPublish ?? true;
    const requestedCanSubscribe = parsed.canSubscribe ?? true;

    if (!hasPremiumCanopyEntitlement(user.sub)) {
        return c.json(
            { code: 'premium_required', message: 'Premium canopy subscription required' },
            402
        );
    }

    // Joining does not start a room; only `/rooms/create` does, behind the
    // directory and role checks. Joining used to create whatever room it was
    // asked for, so any account could start one in any canopy, listed or not.
    if (!db.getVoiceRoom(canopyId, channelId)) {
        return c.json({ code: 'room_not_found', message: 'Room not found' }, 404);
    }

    const verdict = await readVoiceRole(user.sub, canopyId);
    const role = roleOrMember(verdict);

    // Read again after the homeserver call: the room may have been locked since.
    const current = db.getVoiceRoom(canopyId, channelId);
    if (!current) return c.json({ code: 'room_not_found', message: 'Room not found' }, 404);
    if (current.isLocked && !canModerate(role)) return lockedRoomRefusal(c, verdict);

    // Refreshes the room's `updatedAt`, as joining always has: the OBS mute
    // path (`services/voiceRooms.ts`) picks a creator's most recently used room.
    const room = db.createOrUpdateVoiceRoom({
        canopyId,
        channelId,
        createdBy: user.sub,
        livekitRoomName: roomName(canopyId, channelId),
    });

    const canPublish = canModerate(role) ? true : requestedCanPublish;
    const canSubscribe = canModerate(role) ? true : requestedCanSubscribe;

    db.joinVoiceRoom({
        roomId: room.id,
        userId: user.sub,
        role,
        canPublish,
        canSubscribe,
    });

    db.logVoiceRoomEvent({
        roomId: room.id,
        canopyId,
        channelId,
        userId: user.sub,
        eventType: 'join',
        metadata: { role },
    });

    const token = createLiveKitAccessToken({
        identity: user.sub,
        name: user.username ?? user.sub,
        roomName: room.livekitRoomName,
        role,
        canPublish,
        canSubscribe,
    });

    return c.json({
        room,
        permissions: { role, canPublish, canSubscribe },
        livekit: {
            url: getLiveKitConfig().url,
            roomName: room.livekitRoomName,
            token: token.token,
            expiresAt: token.expiresAt,
        },
    });
});

voice.post('/rooms/leave', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, roomCoordsSchema);
    if (parsed instanceof Response) return parsed;
    const { canopyId, channelId } = parsed;

    const room = db.getVoiceRoom(canopyId, channelId);
    if (!room) return c.json({ code: 'room_not_found', message: 'Room not found' }, 404);

    const participant = db.leaveVoiceRoom(room.id, user.sub);
    if (!participant) return c.json({ ok: true, message: 'No active participant session found' });

    const sessionDurationSeconds = Math.max(
        0,
        Math.round(
            (Date.parse(participant.leftAt ?? new Date().toISOString()) -
                Date.parse(participant.joinedAt)) /
                1000
        )
    );

    db.logVoiceRoomEvent({
        roomId: room.id,
        canopyId: room.canopyId,
        channelId: room.channelId,
        userId: user.sub,
        eventType: 'leave',
        sessionDurationSeconds,
    });

    return c.json({ ok: true, sessionDurationSeconds });
});

voice.post('/token', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, tokenSchema);
    if (parsed instanceof Response) return parsed;
    const { canopyId, channelId } = parsed;

    if (!db.getVoiceRoom(canopyId, channelId)) {
        return c.json({ code: 'room_not_found', message: 'Room not found' }, 404);
    }

    const verdict = await readVoiceRole(user.sub, canopyId);
    const role = roleOrMember(verdict);

    // Read again after the homeserver call: the room may have been locked since.
    const room = db.getVoiceRoom(canopyId, channelId);
    if (!room) return c.json({ code: 'room_not_found', message: 'Room not found' }, 404);
    if (room.isLocked && !canModerate(role)) return lockedRoomRefusal(c, verdict);

    const token = createLiveKitAccessToken({
        identity: user.sub,
        name: user.username ?? user.sub,
        roomName: room.livekitRoomName,
        role,
        canPublish: parsed.canPublish ?? true,
        canSubscribe: parsed.canSubscribe ?? true,
        ttlSeconds: parsed.ttlSeconds,
    });

    return c.json({
        roomName: room.livekitRoomName,
        url: getLiveKitConfig().url,
        token: token.token,
        expiresAt: token.expiresAt,
    });
});

voice.post('/rooms/moderation/:action', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const action = c.req.param('action');
    const parsed = await readJsonBody(c, moderationSchema);
    if (parsed instanceof Response) return parsed;
    const { canopyId, channelId } = parsed;
    const targetUserId = parsed.targetUserId ?? '';

    const verdict = await readVoiceRole(user.sub, canopyId);
    if (!verdict.ok) return refuse(c, verdict.reason);
    if (!canModerate(verdict.role)) return refuse(c, 'not_canopy_moderator');
    const { role } = verdict;

    const room = db.getVoiceRoom(canopyId, channelId);
    if (!room) return c.json({ code: 'room_not_found', message: 'Room not found' }, 404);

    if (action === 'lock') {
        const isLocked = parsed.locked ?? true;
        const updated = db.setVoiceRoomLock(room.id, isLocked);
        db.logVoiceRoomEvent({
            roomId: room.id,
            canopyId,
            channelId,
            userId: user.sub,
            actorId: user.sub,
            eventType: isLocked ? 'lock' : 'unlock',
            metadata: { role },
        });
        return c.json({ room: updated });
    }

    if (!targetUserId) {
        return c.json(
            {
                code: 'invalid_request',
                message: 'targetUserId is required for mute/remove actions',
            },
            400
        );
    }

    if (action === 'remove') {
        db.leaveVoiceRoom(room.id, targetUserId);
    }

    db.logVoiceRoomEvent({
        roomId: room.id,
        canopyId,
        channelId,
        userId: user.sub,
        actorId: user.sub,
        targetUserId,
        eventType: action === 'mute' ? 'mute' : 'remove',
        metadata: { role },
    });

    return c.json({ ok: true, action, targetUserId });
});

voice.get('/rooms/:canopyId/:channelId/events', (c) => {
    const canopyId = c.req.param('canopyId');
    const channelId = c.req.param('channelId');

    const room = db.getVoiceRoom(canopyId, channelId);
    if (!room) return c.json({ code: 'room_not_found', message: 'Room not found' }, 404);

    return c.json({
        events: db.listVoiceRoomEvents(room.id),
        activeParticipants: db.getVoiceRoomActiveParticipants(room.id),
    });
});

export default voice;
