import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { generateManagedStreamKey, getOwncastOriginConfig } from '../integrations/owncast';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability } from './authz';
import { hasActiveCreatorSubscription } from '../services/creatorSubscriptions';
import { aggregateStreamRevenue, evaluateStreamGoal } from '../services/streamGoals';
import { dispatchEvent as dispatchOutboundEvent } from '../services/outboundEventWebhooks';
import {
  startAllForUser as startAllRtmpFanouts,
  stopAllForUser as stopAllRtmpFanouts,
} from '../services/rtmpFanoutWorker';
import {
  notifyStreamStarted as notifyObsWsStreamStarted,
  notifyStreamEnded as notifyObsWsStreamEnded,
} from '../integrations/obs-ws-compat/server';
import { log } from '../telemetry/logger';
import type { FeatureModule } from './types';

const streamKeySchema = z
  .object({ streamId: z.string().optional(), rotate: z.boolean().optional() })
  .optional();

const streamStateSchema = z.object({
  creatorId: z.string().min(1),
  state: z.enum(['offline', 'live']),
});

const streamMetadataSchema = z.object({
  creatorId: z.string().min(1),
  title: z.string().min(1),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  latencyProfile: z.enum(['normal', 'low']).optional(),
});

const streamAccessSchema = z.object({
  creatorId: z.string().min(1),
  visibility: z.enum(['public', 'private', 'member_only']),
  allowedSubscriberIds: z.array(z.string()).optional(),
});

const streamSessionSchema = z.object({
  creatorId: z.string().min(1),
  replayPointer: z.string().optional(),
});

const streamSessionPatchSchema = z.object({ replayPointer: z.string().optional() }).optional();

const streamModerationSchema = z.object({
  slowModeSeconds: z.number().optional(),
  bannedUserIds: z.array(z.string()).optional(),
  keywordFilters: z.array(z.string()).optional(),
});

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
    const parsed = await readJsonBody(c, streamKeySchema);
    const payload = parsed instanceof Response ? {} : parsed ?? {};
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
    const parsed = await readJsonBody(c, streamStateSchema);
    if (parsed instanceof Response) return parsed;

    const stream = ensureStream(streamId, parsed.creatorId);
    const updated = db.upsertStream({ ...stream, state: parsed.state });
    return c.json(updated);
  });

  streaming.put('/streams/:streamId/metadata', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { streamId } = c.req.param();
    const parsed = await readJsonBody(c, streamMetadataSchema);
    if (parsed instanceof Response) return parsed;

    const stream = ensureStream(streamId, parsed.creatorId);
    const updated = db.upsertStream({
      ...stream,
      title: parsed.title,
      category: parsed.category,
      tags: parsed.tags ?? stream.tags,
      latencyProfile: parsed.latencyProfile ?? stream.latencyProfile,
    });
    return c.json(updated);
  });

  streaming.put('/streams/:streamId/access', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { streamId } = c.req.param();
    const parsed = await readJsonBody(c, streamAccessSchema);
    if (parsed instanceof Response) return parsed;

    const stream = ensureStream(streamId, parsed.creatorId);
    const updated = db.upsertStream({
      ...stream,
      visibility: parsed.visibility,
      allowedSubscriberIds: parsed.allowedSubscriberIds ?? stream.allowedSubscriberIds,
    });

    return c.json(updated);
  });

  // GET /v1/streaming/streams — list streams. Lightweight directory
  // surface used by the AppShell `/live` route. Filters supported:
  //   - state=live|offline (default: any)
  //   - creatorId (defaults to "any")
  //   - limit (1..200, default 50)
  // Visibility-gated: only streams marked `public` are returned to
  // unauthenticated readers; non-public streams require the requester
  // to be the creator or an explicitly allowed subscriber. Pre-existing
  // gating logic lives in `/streams/:streamId/access`; we mirror its
  // behavior in-memory so the listing endpoint stays a one-shot read.
  streaming.get('/streams', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const stateParam = c.req.query('state');
    const creatorIdFilter = c.req.query('creatorId');
    const limitRaw = c.req.query('limit');
    const limit = (() => {
      if (!limitRaw) return 50;
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return 50;
      return Math.min(parsed, 200);
    })();

    const filterState = stateParam === 'live' || stateParam === 'offline' ? stateParam : null;
    const all = db.listAllStreams();

    const items = all
      .filter((stream) => stream.visibility === 'public')
      .filter((stream) => (filterState ? stream.state === filterState : true))
      .filter((stream) => (creatorIdFilter ? stream.creatorId === creatorIdFilter : true))
      .sort((a, b) => {
        if (a.state !== b.state) return a.state === 'live' ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, limit);

    return c.json({
      items: items.map((stream) => ({
        id: stream.id,
        creatorId: stream.creatorId,
        state: stream.state,
        title: stream.title,
        category: stream.category,
        tags: stream.tags,
        visibility: stream.visibility,
        latencyProfile: stream.latencyProfile,
        replayPointer: stream.replayPointer,
        updatedAt: stream.updatedAt,
      })),
    });
  });

  // GET /v1/streaming/streams/:streamId — single stream metadata
  // for the LivestreamViewer. Mirrors the visibility filter from
  // `/access`; returns 404 when the stream is missing or private.
  streaming.get('/streams/:streamId', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const streamId = c.req.param('streamId');
    const stream = db.getStream(streamId);
    if (!stream) return c.json({ code: 'stream_not_found', message: 'Stream not found' }, 404);
    if (stream.visibility === 'private') {
      return c.json({ code: 'stream_not_found', message: 'Stream not found' }, 404);
    }

    return c.json({
      id: stream.id,
      creatorId: stream.creatorId,
      state: stream.state,
      title: stream.title,
      category: stream.category,
      tags: stream.tags,
      visibility: stream.visibility,
      latencyProfile: stream.latencyProfile,
      replayPointer: stream.replayPointer,
      updatedAt: stream.updatedAt,
    });
  });

  streaming.get('/streams/:streamId/access', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const streamId = c.req.param('streamId');
    const subscriberId = c.req.query('subscriberId');
    const stream = db.getStream(streamId);
    if (!stream) return c.json({ code: 'stream_not_found', message: 'Stream not found' }, 404);

    let canAccess = stream.visibility === 'public';
    if (!canAccess && subscriberId) {
      const manualOverride = stream.allowedSubscriberIds.includes(subscriberId);
      if (manualOverride) {
        canAccess = true;
      } else if (stream.visibility === 'member_only') {
        canAccess = hasActiveCreatorSubscription(subscriberId, stream.creatorId);
      }
    }

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
    const parsed = await readJsonBody(c, streamSessionSchema);
    if (parsed instanceof Response) return parsed;

    const stream = ensureStream(streamId, parsed.creatorId);
    const session = db.createStreamSession({ id: crypto.randomUUID(), streamId, startedAt: new Date().toISOString(), replayPointer: parsed.replayPointer });
    if (parsed.replayPointer) {
      db.upsertStream({ ...stream, replayPointer: parsed.replayPointer });
    }

    void dispatchOutboundEvent({
      type: 'livestream.started',
      blackoutUserId: stream.creatorId,
      data: {
        streamId,
        sessionId: session.id,
        title: stream.title,
        category: stream.category,
        visibility: stream.visibility,
      },
      occurredAt: session.startedAt,
    }).catch((err) => log.warn('streaming_outbound_dispatch_threw', { type: 'livestream.started', error: String(err) }));

    // Auto-start RTMP fan-out for every enabled simulcast destination
    // the creator has configured. Best-effort — any per-destination
    // spawn failure is captured by the worker and surfaced via
    // GET /v1/integrations/simulcast/fanout/:id/status, not here.
    try {
      const fanoutResult = startAllRtmpFanouts(stream.creatorId);
      log.info('streaming_rtmp_fanout_started', {
        streamId,
        attempted: fanoutResult.attempted,
        started: fanoutResult.started,
      });
    } catch (err) {
      log.warn('streaming_rtmp_fanout_start_threw', { streamId, error: String(err) });
    }

    // Push a StreamStateChanged event to every identified OBS-WS surface
    // for this creator. Companion / Stream Deck plugins re-render their
    // "Stream live" tile on receipt — so a stream that just went live
    // via the Blackout UI lights up the surface without manual polling.
    try {
      notifyObsWsStreamStarted(stream.creatorId);
    } catch (err) {
      log.warn('streaming_obs_ws_notify_threw', {
        streamId,
        type: 'started',
        error: String(err),
      });
    }

    return c.json(session, 201);
  });

  streaming.patch('/streams/:streamId/sessions/:sessionId', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const sessionId = c.req.param('sessionId');
    const parsed = await readJsonBody(c, streamSessionPatchSchema);
    const replayPointer = parsed instanceof Response ? undefined : parsed?.replayPointer;
    const session = db.endStreamSession(sessionId, replayPointer);
    if (!session) return c.json({ code: 'session_not_found', message: 'Session not found' }, 404);

    const stream = db.getStream(session.streamId);
    if (stream && replayPointer) {
      db.upsertStream({ ...stream, replayPointer });
    }

    if (stream) {
      const startedAtMs = Date.parse(session.startedAt);
      const endedAtMs = session.endedAt ? Date.parse(session.endedAt) : Date.now();
      void dispatchOutboundEvent({
        type: 'livestream.ended',
        blackoutUserId: stream.creatorId,
        data: {
          streamId: session.streamId,
          sessionId: session.id,
          title: stream.title,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSeconds: Number.isFinite(startedAtMs)
            ? Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000))
            : undefined,
        },
        occurredAt: session.endedAt,
      }).catch((err) => log.warn('streaming_outbound_dispatch_threw', { type: 'livestream.ended', error: String(err) }));

      // Stop every running fan-out for this creator. The worker
      // gracefully SIGTERMs each ffmpeg; restart timers are cleared.
      try {
        const fanoutResult = stopAllRtmpFanouts(stream.creatorId);
        log.info('streaming_rtmp_fanout_stopped', {
          streamId: session.streamId,
          stopped: fanoutResult.stopped,
        });
      } catch (err) {
        log.warn('streaming_rtmp_fanout_stop_threw', {
          streamId: session.streamId,
          error: String(err),
        });
      }

      // Push a StreamStateChanged: outputActive=false event to every
      // identified OBS-WS surface so Companion's "Stream live" tile
      // flips off in real time.
      try {
        notifyObsWsStreamEnded(stream.creatorId);
      } catch (err) {
        log.warn('streaming_obs_ws_notify_threw', {
          streamId: session.streamId,
          type: 'ended',
          error: String(err),
        });
      }
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
    const parsed = await readJsonBody(c, streamModerationSchema);
    if (parsed instanceof Response) return parsed;

    const moderation = db.upsertStreamModeration({
      streamId,
      slowModeSeconds: Math.max(0, Math.floor(parsed.slowModeSeconds ?? 0)),
      bannedUserIds: parsed.bannedUserIds ?? [],
      keywordFilters: parsed.keywordFilters ?? [],
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

  streaming.get('/streams/:streamId/revenue', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;
    return c.json(aggregateStreamRevenue(c.req.param('streamId')));
  });

  streaming.get('/streams/:streamId/goal', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;
    const targetCentsRaw = c.req.query('targetCents');
    const currency = c.req.query('currency') ?? 'USD';
    const targetCents = targetCentsRaw ? Number(targetCentsRaw) : NaN;
    if (!Number.isFinite(targetCents) || !Number.isInteger(targetCents) || targetCents < 0) {
      return c.json({ code: 'invalid_target', message: 'targetCents must be a non-negative integer' }, 400);
    }
    return c.json(evaluateStreamGoal(c.req.param('streamId'), targetCents, currency));
  });

  return streaming;
}

export const streamingModule: FeatureModule = {
  id: 'streaming',
  mountPath: '/streaming',
  registerRoutes: createStreamingRouter,
};
