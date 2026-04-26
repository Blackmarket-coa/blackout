import { Hono } from 'hono';
import { db } from '../db/store';
import { generateManagedStreamKey, getOwncastOriginConfig } from '../integrations/owncast';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

function ensureStream(streamId: string, creatorId: string) {
  return (
    db.getStream(streamId) ??
    db.upsertStream({
      id: streamId,
      creatorId,
      state: 'offline',
      title: 'Untitled stream',
      tags: [],
      visibility: 'public',
      allowedSubscriberIds: [],
      latencyProfile: 'normal',
    })
  );
}

function createStreamingRouter() {
  const streaming = new Hono();

  streaming.get('/origin', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    return c.json(getOwncastOriginConfig());
  });

  streaming.post('/creators/:creatorId/stream-key', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { creatorId } = c.req.param();
    const payload = (await c.req.json().catch(() => ({}))) as { streamId?: string; rotate?: boolean };
    const current = db.getCreatorStreamAuth(creatorId);
    const streamId = payload.streamId ?? current?.streamId ?? crypto.randomUUID();

    const shouldRotate = Boolean(payload.rotate) || !current;
    const streamKey = shouldRotate ? generateManagedStreamKey() : current.streamKey;
    const { origin } = getOwncastOriginConfig();

    const auth = db.upsertCreatorStreamAuth({
      id: current?.id ?? crypto.randomUUID(),
      creatorId,
      streamId,
      owncastUrl: origin,
      streamKey,
    });

    const stream = ensureStream(streamId, creatorId);
    return c.json({ ...auth, stream }, current ? 200 : 201);
  });

  streaming.get('/creators/:creatorId/stream-key', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const { creatorId } = c.req.param();
    const auth = db.getCreatorStreamAuth(creatorId);
    if (!auth) return c.json({ code: 'stream_key_not_found', message: 'No managed stream key found for creator' }, 404);

    return c.json(auth);
  });

  streaming.put('/streams/:streamId/state', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { streamId } = c.req.param();
    const payload = (await c.req.json()) as { creatorId?: string; state?: 'offline' | 'live' };
    if (!payload.creatorId || !payload.state) {
      return c.json({ code: 'invalid_request', message: 'creatorId and state are required' }, 400);
    }

    const stream = ensureStream(streamId, payload.creatorId);
    const updated = db.upsertStream({ ...stream, state: payload.state });
    return c.json(updated);
  });

  streaming.put('/streams/:streamId/metadata', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { streamId } = c.req.param();
    const payload = (await c.req.json()) as {
      creatorId?: string;
      title?: string;
      category?: string;
      tags?: string[];
      latencyProfile?: 'normal' | 'low';
    };

    if (!payload.creatorId || !payload.title) {
      return c.json({ code: 'invalid_request', message: 'creatorId and title are required' }, 400);
    }

    const stream = ensureStream(streamId, payload.creatorId);
    const updated = db.upsertStream({
      ...stream,
      title: payload.title,
      category: payload.category,
      tags: Array.isArray(payload.tags) ? payload.tags : stream.tags,
      latencyProfile: payload.latencyProfile ?? stream.latencyProfile,
    });
    return c.json(updated);
  });

  streaming.put('/streams/:streamId/access', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { streamId } = c.req.param();
    const payload = (await c.req.json()) as {
      creatorId?: string;
      visibility?: 'public' | 'private' | 'member_only';
      allowedSubscriberIds?: string[];
    };

    if (!payload.creatorId || !payload.visibility) {
      return c.json({ code: 'invalid_request', message: 'creatorId and visibility are required' }, 400);
    }

    const stream = ensureStream(streamId, payload.creatorId);
    const updated = db.upsertStream({
      ...stream,
      visibility: payload.visibility,
      allowedSubscriberIds: Array.isArray(payload.allowedSubscriberIds) ? payload.allowedSubscriberIds : stream.allowedSubscriberIds,
    });

    return c.json(updated);
  });

  streaming.get('/streams/:streamId/access', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const streamId = c.req.param('streamId');
    const subscriberId = c.req.query('subscriberId');
    const stream = db.getStream(streamId);
    if (!stream) return c.json({ code: 'stream_not_found', message: 'Stream not found' }, 404);

    const canAccess =
      stream.visibility === 'public' ||
      (subscriberId ? stream.allowedSubscriberIds.includes(subscriberId) : false);

    return c.json({
      streamId,
      visibility: stream.visibility,
      allowedSubscriberIds: stream.allowedSubscriberIds,
      subscriberId: subscriberId ?? null,
      canAccess,
    });
  });

  streaming.post('/streams/:streamId/sessions', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { streamId } = c.req.param();
    const payload = (await c.req.json()) as { creatorId?: string; replayPointer?: string };
    if (!payload.creatorId) {
      return c.json({ code: 'invalid_request', message: 'creatorId is required' }, 400);
    }

    const stream = ensureStream(streamId, payload.creatorId);
    const session = db.createStreamSession({ id: crypto.randomUUID(), streamId, startedAt: new Date().toISOString(), replayPointer: payload.replayPointer });
    if (payload.replayPointer) {
      db.upsertStream({ ...stream, replayPointer: payload.replayPointer });
    }

    return c.json(session, 201);
  });

  streaming.patch('/streams/:streamId/sessions/:sessionId', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const sessionId = c.req.param('sessionId');
    const payload = (await c.req.json().catch(() => ({}))) as { replayPointer?: string };
    const session = db.endStreamSession(sessionId, payload.replayPointer);
    if (!session) return c.json({ code: 'session_not_found', message: 'Session not found' }, 404);

    const stream = db.getStream(session.streamId);
    if (stream && payload.replayPointer) {
      db.upsertStream({ ...stream, replayPointer: payload.replayPointer });
    }

    return c.json(session);
  });

  streaming.get('/streams/:streamId/sessions', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    return c.json(db.listStreamSessions(c.req.param('streamId')));
  });

  streaming.put('/streams/:streamId/moderation', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { streamId } = c.req.param();
    const payload = (await c.req.json()) as {
      slowModeSeconds?: number;
      bannedUserIds?: string[];
      keywordFilters?: string[];
    };

    const moderation = db.upsertStreamModeration({
      streamId,
      slowModeSeconds: Math.max(0, Math.floor(payload.slowModeSeconds ?? 0)),
      bannedUserIds: Array.isArray(payload.bannedUserIds) ? payload.bannedUserIds : [],
      keywordFilters: Array.isArray(payload.keywordFilters) ? payload.keywordFilters : [],
    });

    const event = emitDomainEvent({
      module: 'moderation',
      type: 'moderation.stream.chat.updated',
      payload: {
        streamId,
        slowModeSeconds: moderation.slowModeSeconds,
        bannedUserCount: moderation.bannedUserIds.length,
        keywordFilterCount: moderation.keywordFilters.length,
      },
    });

    return c.json({ ...moderation, event });
  });

  streaming.get('/streams/:streamId/moderation', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const streamId = c.req.param('streamId');
    return c.json(db.getStreamModeration(streamId) ?? { streamId, slowModeSeconds: 0, bannedUserIds: [], keywordFilters: [] });
  });

  streaming.get('/events', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    return c.json(listDomainEvents('streaming'));
  });

  return streaming;
}

export const streamingModule: FeatureModule = {
  id: 'streaming',
  mountPath: '/streaming',
  registerRoutes: createStreamingRouter,
};
