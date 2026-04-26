import { Hono } from 'hono';
import { db } from '../db/store';
import { requireUser } from '../middleware/require-user';
import { createLiveKitAccessToken, getLiveKitConfig, type VoiceRole } from '../services/livekit';
import { hasPremiumCanopyEntitlement } from '../services/subscriptions';

function roleFromRequest(input: unknown): VoiceRole {
  if (input === 'admin' || input === 'moderator') return input;
  return 'member';
}

function canModerate(role: VoiceRole): boolean {
  return role === 'admin' || role === 'moderator';
}

function roomName(canopyId: string, channelId: string): string {
  return `canopy-${canopyId}-channel-${channelId}`;
}

const voice = new Hono();

voice.get('/config', (c) => {
  const config = getLiveKitConfig();
  return c.json({ url: config.url, tokenTtlSeconds: config.tokenTtlSeconds });
});

voice.post('/rooms/create', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const payload = await c.req.json();
  const canopyId = String(payload.canopyId ?? '').trim();
  const channelId = String(payload.channelId ?? '').trim();
  const role = roleFromRequest(payload.role);

  if (!canopyId || !channelId) {
    return c.json({ error: 'canopyId and channelId are required' }, 400);
  }

  if (!hasPremiumCanopyEntitlement(user.sub)) {
    return c.json({ error: 'Premium canopy subscription required' }, 402);
  }

  if (!canModerate(role)) {
    return c.json({ error: 'Only canopy admins/mods can create voice rooms' }, 403);
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

  const payload = await c.req.json();
  const canopyId = String(payload.canopyId ?? '').trim();
  const channelId = String(payload.channelId ?? '').trim();
  const role = roleFromRequest(payload.role);
  const requestedCanPublish = payload.canPublish == null ? true : Boolean(payload.canPublish);
  const requestedCanSubscribe = payload.canSubscribe == null ? true : Boolean(payload.canSubscribe);

  if (!canopyId || !channelId) {
    return c.json({ error: 'canopyId and channelId are required' }, 400);
  }

  if (!hasPremiumCanopyEntitlement(user.sub)) {
    return c.json({ error: 'Premium canopy subscription required' }, 402);
  }

  const room = db.createOrUpdateVoiceRoom({
    canopyId,
    channelId,
    createdBy: user.sub,
    livekitRoomName: roomName(canopyId, channelId),
  });

  if (room.isLocked && !canModerate(role)) {
    return c.json({ error: 'Room is locked' }, 423);
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

  const payload = await c.req.json();
  const canopyId = String(payload.canopyId ?? '').trim();
  const channelId = String(payload.channelId ?? '').trim();

  const room = db.getVoiceRoom(canopyId, channelId);
  if (!room) return c.json({ error: 'Room not found' }, 404);

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

  const payload = await c.req.json();
  const canopyId = String(payload.canopyId ?? '').trim();
  const channelId = String(payload.channelId ?? '').trim();
  const role = roleFromRequest(payload.role);

  const room = db.getVoiceRoom(canopyId, channelId);
  if (!room) return c.json({ error: 'Room not found' }, 404);

  if (room.isLocked && !canModerate(role)) {
    return c.json({ error: 'Room is locked' }, 423);
  }

  const token = createLiveKitAccessToken({
    identity: user.sub,
    name: user.username ?? user.sub,
    roomName: room.livekitRoomName,
    role,
    canPublish: payload.canPublish == null ? true : Boolean(payload.canPublish),
    canSubscribe: payload.canSubscribe == null ? true : Boolean(payload.canSubscribe),
    ttlSeconds: Number(payload.ttlSeconds),
  });

  return c.json({ roomName: room.livekitRoomName, url: getLiveKitConfig().url, token: token.token, expiresAt: token.expiresAt });
});

voice.post('/rooms/moderation/:action', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const action = c.req.param('action');
  const payload = await c.req.json();
  const canopyId = String(payload.canopyId ?? '').trim();
  const channelId = String(payload.channelId ?? '').trim();
  const targetUserId = String(payload.targetUserId ?? '').trim();
  const role = roleFromRequest(payload.role);

  if (!canModerate(role)) {
    return c.json({ error: 'Only canopy admins/mods can perform voice moderation controls' }, 403);
  }

  const room = db.getVoiceRoom(canopyId, channelId);
  if (!room) return c.json({ error: 'Room not found' }, 404);

  if (action === 'lock') {
    const isLocked = payload.locked == null ? true : Boolean(payload.locked);
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
    return c.json({ error: 'targetUserId is required for mute/remove actions' }, 400);
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
  if (!room) return c.json({ error: 'Room not found' }, 404);

  return c.json({ events: db.listVoiceRoomEvents(room.id), activeParticipants: db.getVoiceRoomActiveParticipants(room.id) });
});

export default voice;
