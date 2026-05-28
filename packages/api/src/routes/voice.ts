/**
 * WHAT THIS FILE DOES
 * Voice/video room management — create rooms, join them, get LiveKit tokens,
 * and moderate (mute, kick, lock). All powered by LiveKit under the hood.
 *
 * WHAT WAS WRONG (THE ROLE BYPASS)
 * The `role` field came from the untrusted request body. Any authenticated
 * user could send `{ "role": "admin" }` and pass all moderation checks —
 * becoming a room admin without any actual permissions on the canopy.
 *
 * HOW IT WAS FIXED
 * 1. `roleFromRequest(parsed.role)` replaced with `roleForCanopy(user.sub, canopyId)`.
 *    This looks up the user's actual role on the server side (from canopy
 *    membership) instead of trusting what the client sends.
 * 2. For MVP, `roleForCanopy` always returns `'member'` — no one gets admin
 *    via voice routes until a proper canopy membership system is built.
 * 3. `role` field removed from `roomCoordsSchema` — no longer accepted from clients.
 * 4. `voiceRateLimit` (10 req/min) prevents flooding LiveKit token generation.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import { createLiveKitAccessToken, getLiveKitConfig, type VoiceRole } from '../services/livekit';
import { hasPremiumCanopyEntitlement } from '../services/subscriptions';
import { hasCanopy } from '../services/canopyDirectory';
import { voiceRateLimit } from '../middleware/rate-limit';

function roleForCanopy(_userId: string, _canopyId: string): VoiceRole {
  // TODO: Look up canopy membership role from a canopy members table.
  // For MVP, no user has admin/moderator privileges via voice routes —
  // those roles must be assigned through a proper canopy membership system.
  return 'member';
}

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

function roomName(canopyId: string, channelId: string): string {
  return `canopy-${canopyId}-channel-${channelId}`;
}

const voice = new Hono();
voice.use('*', voiceRateLimit);

voice.get('/config', (c) => {
  const config = getLiveKitConfig();
  return c.json({ url: config.url, tokenTtlSeconds: config.tokenTtlSeconds });
});

voice.post('/rooms/create', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const parsed = await readJsonBody(c, roomCoordsSchema);
  if (parsed instanceof Response) return parsed;
  const { canopyId, channelId } = parsed;
  const role = roleForCanopy(user.sub, canopyId);

  if (!hasCanopy(canopyId)) {
    return c.json({ code: 'unknown_canopy', message: 'Canopy is not registered', canopyId }, 404);
  }

  if (!hasPremiumCanopyEntitlement(user.sub)) {
    return c.json({ code: 'premium_required', message: 'Premium canopy subscription required' }, 402);
  }

  if (!canModerate(role)) {
    return c.json({ code: 'forbidden', message: 'Only canopy admins/mods can create voice rooms' }, 403);
  }

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
  const role = roleForCanopy(user.sub, canopyId);
  const requestedCanPublish = parsed.canPublish ?? true;
  const requestedCanSubscribe = parsed.canSubscribe ?? true;

  if (!hasPremiumCanopyEntitlement(user.sub)) {
    return c.json({ code: 'premium_required', message: 'Premium canopy subscription required' }, 402);
  }

  const room = db.createOrUpdateVoiceRoom({
    canopyId,
    channelId,
    createdBy: user.sub,
    livekitRoomName: roomName(canopyId, channelId),
  });

  if (room.isLocked && !canModerate(role)) {
    return c.json({ code: 'room_locked', message: 'Room is locked' }, 423);
  }

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

  const sessionDurationSeconds = Math.max(0, Math.round((Date.parse(participant.leftAt ?? new Date().toISOString()) - Date.parse(participant.joinedAt)) / 1000));

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
  const role = roleForCanopy(user.sub, canopyId);

  const room = db.getVoiceRoom(canopyId, channelId);
  if (!room) return c.json({ code: 'room_not_found', message: 'Room not found' }, 404);

  if (room.isLocked && !canModerate(role)) {
    return c.json({ code: 'room_locked', message: 'Room is locked' }, 423);
  }

  const token = createLiveKitAccessToken({
    identity: user.sub,
    name: user.username ?? user.sub,
    roomName: room.livekitRoomName,
    role,
    canPublish: parsed.canPublish ?? true,
    canSubscribe: parsed.canSubscribe ?? true,
    ttlSeconds: parsed.ttlSeconds,
  });

  return c.json({ roomName: room.livekitRoomName, url: getLiveKitConfig().url, token: token.token, expiresAt: token.expiresAt });
});

voice.post('/rooms/moderation/:action', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const action = c.req.param('action');
  const parsed = await readJsonBody(c, moderationSchema);
  if (parsed instanceof Response) return parsed;
  const { canopyId, channelId } = parsed;
  const targetUserId = parsed.targetUserId ?? '';
  const role = roleForCanopy(user.sub, canopyId);

  if (!canModerate(role)) {
    return c.json({ code: 'forbidden', message: 'Only canopy admins/mods can perform voice moderation controls' }, 403);
  }

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
    return c.json({ code: 'invalid_request', message: 'targetUserId is required for mute/remove actions' }, 400);
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

  return c.json({ events: db.listVoiceRoomEvents(room.id), activeParticipants: db.getVoiceRoomActiveParticipants(room.id) });
});

export default voice;
