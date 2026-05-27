import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import type { ClipRecord, StreamRecord } from '../db/types';
import { readJsonBody } from '../middleware/validate';
import { clipWriteRateLimit } from '../middleware/rate-limit';
import { generateManagedStreamKey, getOwncastOriginConfig } from '../integrations/owncast';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability, requireAuthenticatedUser } from './authz';
import { isAdminUser } from '../services/auth';
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
  denId: z.string().min(1).nullable().optional(),
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

const clipCreateSchema = z.object({
  creatorId: z.string().min(1),
  title: z.string().min(1),
  mediaPointer: z.string().min(1),
  sourceStreamId: z.string().min(1).optional(),
  thumbnailPointer: z.string().min(1).optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  visibility: z.enum(['public', 'private', 'member_only']).optional(),
  tags: z.array(z.string()).optional(),
});

// Partial update: every field optional, but at least one must be present so a
// no-op PATCH is rejected. creatorId is intentionally not editable (ownership
// is fixed at creation).
const clipUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    mediaPointer: z.string().min(1).optional(),
    sourceStreamId: z.string().min(1).optional(),
    thumbnailPointer: z.string().min(1).optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
    visibility: z.enum(['public', 'private', 'member_only']).optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be provided',
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

const ownershipForbidden = (c: Context) =>
  c.json({ code: 'forbidden', message: 'You can only manage your own streams' }, 403);

// Streaming.write is granted to every user, so the capability gate alone does
// not stop one creator from touching another's resources. A creator's id is
// their user id (`sub`); these helpers enforce that a caller only manages
// their own streams.

// For create-or-update stream endpoints that carry `creatorId` in the body:
// the claimed creator must be the caller, and an existing stream must already
// belong to them. Returns a 403 Response when ownership fails, else null.
function assertSelfCreator(c: Context, streamId: string, bodyCreatorId: string): Response | null {
  const subject = requireAuthenticatedUser(c);
  if (bodyCreatorId !== subject) return ownershipForbidden(c);
  const existing = db.getStream(streamId);
  if (existing && existing.creatorId !== subject) return ownershipForbidden(c);
  return null;
}

// For endpoints acting on an existing stream: it must exist (404) and belong to
// the caller (403). Returns the blocking Response, else null.
function requireStreamOwner(c: Context, streamId: string): Response | null {
  const subject = requireAuthenticatedUser(c);
  const stream = db.getStream(streamId);
  if (!stream) return c.json({ code: 'stream_not_found', message: 'Stream not found' }, 404);
  if (stream.creatorId !== subject) return ownershipForbidden(c);
  return null;
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
    if (requireAuthenticatedUser(c) !== creatorId) return ownershipForbidden(c);
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
    // The managed stream key is a publishing secret — gate it on the
    // creator/admin `streaming.write` capability, not the now-universal
    // `streaming.read`, so a viewer can't read it and hijack the broadcast.
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { creatorId } = c.req.param();
    if (requireAuthenticatedUser(c) !== creatorId) return ownershipForbidden(c);
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
    const ownerDenied = assertSelfCreator(c, streamId, parsed.creatorId);
    if (ownerDenied) return ownerDenied;

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
    const ownerDenied = assertSelfCreator(c, streamId, parsed.creatorId);
    if (ownerDenied) return ownerDenied;

    const stream = ensureStream(streamId, parsed.creatorId);
    // `denId === null` clears the association; `undefined` leaves it
    // untouched. Anything else is the new den id.
    const nextDenId =
      parsed.denId === undefined ? stream.denId : parsed.denId ?? undefined;
    const updated = db.upsertStream({
      ...stream,
      title: parsed.title,
      category: parsed.category,
      tags: parsed.tags ?? stream.tags,
      latencyProfile: parsed.latencyProfile ?? stream.latencyProfile,
      denId: nextDenId,
    });
    return c.json(updated);
  });

  streaming.put('/streams/:streamId/access', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { streamId } = c.req.param();
    const parsed = await readJsonBody(c, streamAccessSchema);
    if (parsed instanceof Response) return parsed;
    const ownerDenied = assertSelfCreator(c, streamId, parsed.creatorId);
    if (ownerDenied) return ownerDenied;

    const stream = ensureStream(streamId, parsed.creatorId);
    const updated = db.upsertStream({
      ...stream,
      visibility: parsed.visibility,
      allowedSubscriberIds: parsed.allowedSubscriberIds ?? stream.allowedSubscriberIds,
    });

    return c.json(updated);
  });

  const streamToJson = (stream: StreamRecord) => ({
    id: stream.id,
    creatorId: stream.creatorId,
    state: stream.state,
    title: stream.title,
    category: stream.category,
    tags: stream.tags,
    visibility: stream.visibility,
    latencyProfile: stream.latencyProfile,
    replayPointer: stream.replayPointer,
    denId: stream.denId,
    updatedAt: stream.updatedAt,
  });

  // GET /v1/streaming/categories — distinct categories across public
  // streams with their live counts, for the browse surface's category
  // chips. Sorted by live count (desc), then name.
  streaming.get('/categories', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const counts = new Map<string, { total: number; live: number }>();
    for (const stream of db.listAllStreams()) {
      if (stream.visibility !== 'public') continue;
      const name = stream.category?.trim();
      if (!name) continue;
      const entry = counts.get(name) ?? { total: 0, live: 0 };
      entry.total += 1;
      if (stream.state === 'live') entry.live += 1;
      counts.set(name, entry);
    }
    const categories = [...counts.entries()]
      .map(([name, { total, live }]) => ({ name, total, live }))
      .sort((a, b) => (b.live !== a.live ? b.live - a.live : a.name.localeCompare(b.name)));
    return c.json({ categories });
  });

  // GET /v1/streaming/streams — list streams. Directory + browse surface
  // used by the AppShell `/live` and `/explore` routes. Filters supported:
  //   - state=live|offline (default: any)
  //   - creatorId (defaults to "any")
  //   - category (exact category match)
  //   - tags (comma-separated; matches streams carrying ANY of the tags)
  //   - search (case-insensitive substring on title)
  //   - sort=live|recent|title (default: live — live-first then recency)
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
    const categoryFilter = c.req.query('category')?.trim() || null;
    const searchFilter = c.req.query('search')?.trim().toLowerCase() || null;
    const sortParam = c.req.query('sort');
    const tagFilters = (c.req.query('tags') ?? '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    const limitRaw = c.req.query('limit');
    const limit = (() => {
      if (!limitRaw) return 50;
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return 50;
      return Math.min(parsed, 200);
    })();

    const filterState = stateParam === 'live' || stateParam === 'offline' ? stateParam : null;
    const sortMode = sortParam === 'recent' || sortParam === 'title' ? sortParam : 'live';
    const all = db.listAllStreams();

    const items = all
      .filter((stream) => stream.visibility === 'public')
      .filter((stream) => (filterState ? stream.state === filterState : true))
      .filter((stream) => (creatorIdFilter ? stream.creatorId === creatorIdFilter : true))
      .filter((stream) => (categoryFilter ? stream.category === categoryFilter : true))
      .filter((stream) =>
        tagFilters.length === 0
          ? true
          : stream.tags.some((tag) => tagFilters.includes(tag.toLowerCase())),
      )
      .filter((stream) =>
        searchFilter ? stream.title.toLowerCase().includes(searchFilter) : true,
      )
      .sort((a, b) => {
        if (sortMode === 'title') return a.title.localeCompare(b.title);
        if (sortMode === 'recent') return b.updatedAt.localeCompare(a.updatedAt);
        // 'live': live-first, then recency.
        if (a.state !== b.state) return a.state === 'live' ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, limit);

    return c.json({ items: items.map(streamToJson) });
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

    return c.json(streamToJson(stream));
  });

  // GET /v1/streaming/streams/:streamId/vods — public VOD list for a stream:
  // past broadcast sessions that produced a replay (replayPointer set),
  // newest first. Distinct from the creator-private `/sessions` operational
  // history; this is the viewer-facing "past broadcasts" surface and mirrors
  // the single-stream visibility gating (404 on missing/private).
  streaming.get('/streams/:streamId/vods', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const streamId = c.req.param('streamId');
    const stream = db.getStream(streamId);
    if (!stream || stream.visibility === 'private') {
      return c.json({ code: 'stream_not_found', message: 'Stream not found' }, 404);
    }

    const vods = db
      .listStreamSessions(streamId)
      .filter((session) => Boolean(session.replayPointer))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((session) => {
        const durationSeconds =
          session.endedAt
            ? Math.max(0, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000))
            : undefined;
        return {
          id: session.id,
          streamId: session.streamId,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          replayPointer: session.replayPointer,
          durationSeconds,
        };
      });
    return c.json({ items: vods });
  });

  const clipToJson = (clip: ClipRecord) => ({
    id: clip.id,
    creatorId: clip.creatorId,
    sourceStreamId: clip.sourceStreamId,
    title: clip.title,
    mediaPointer: clip.mediaPointer,
    thumbnailPointer: clip.thumbnailPointer,
    durationSeconds: clip.durationSeconds,
    visibility: clip.visibility,
    tags: clip.tags,
    createdAt: clip.createdAt,
    updatedAt: clip.updatedAt,
  });

  // GET /v1/streaming/clips — short-form clip directory. Mirrors the
  // streams listing: only `public` clips are returned, newest first.
  // Filters: creatorId, limit (1..200, default 50).
  streaming.get('/clips', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const creatorIdFilter = c.req.query('creatorId');
    const limitRaw = c.req.query('limit');
    const limit = (() => {
      if (!limitRaw) return 50;
      const parsed = Number.parseInt(limitRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return 50;
      return Math.min(parsed, 200);
    })();

    const items = db
      .listClips({ creatorId: creatorIdFilter ?? undefined, limit })
      .filter((clip) => clip.visibility === 'public');

    return c.json({ items: items.map(clipToJson) });
  });

  // GET /v1/streaming/clips/:clipId — single clip. 404 when missing or private.
  streaming.get('/clips/:clipId', (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'read');
    if (denied) return denied;

    const clip = db.getClip(c.req.param('clipId'));
    if (!clip || clip.visibility === 'private') {
      return c.json({ code: 'clip_not_found', message: 'Clip not found' }, 404);
    }
    return c.json(clipToJson(clip));
  });

  // POST /v1/streaming/clips — create a clip. The body's creatorId must be
  // the caller, and (if set) the source stream must belong to them too.
  streaming.post('/clips', clipWriteRateLimit, async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const parsed = await readJsonBody(c, clipCreateSchema);
    if (parsed instanceof Response) return parsed;

    const subject = requireAuthenticatedUser(c);
    if (parsed.creatorId !== subject) return ownershipForbidden(c);
    if (parsed.sourceStreamId) {
      const sourceStream = db.getStream(parsed.sourceStreamId);
      if (sourceStream && sourceStream.creatorId !== subject) return ownershipForbidden(c);
    }

    const clip = db.upsertClip({
      id: crypto.randomUUID(),
      creatorId: parsed.creatorId,
      sourceStreamId: parsed.sourceStreamId,
      title: parsed.title,
      mediaPointer: parsed.mediaPointer,
      thumbnailPointer: parsed.thumbnailPointer,
      durationSeconds: parsed.durationSeconds ?? 0,
      visibility: parsed.visibility ?? 'public',
      tags: parsed.tags ?? [],
    });
    return c.json(clipToJson(clip), 201);
  });

  // PATCH /v1/streaming/clips/:clipId — owner-only partial update.
  streaming.patch('/clips/:clipId', clipWriteRateLimit, async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { clipId } = c.req.param();
    const clip = db.getClip(clipId);
    if (!clip) return c.json({ code: 'clip_not_found', message: 'Clip not found' }, 404);

    const subject = requireAuthenticatedUser(c);
    if (clip.creatorId !== subject) return ownershipForbidden(c);

    const parsed = await readJsonBody(c, clipUpdateSchema);
    if (parsed instanceof Response) return parsed;

    // Re-pointing a clip at a source stream requires owning that stream too.
    if (parsed.sourceStreamId) {
      const sourceStream = db.getStream(parsed.sourceStreamId);
      if (sourceStream && sourceStream.creatorId !== subject) return ownershipForbidden(c);
    }

    const updated = db.updateClip(clipId, parsed);
    if (!updated) return c.json({ code: 'clip_not_found', message: 'Clip not found' }, 404);
    return c.json(clipToJson(updated));
  });

  // DELETE /v1/streaming/clips/:clipId — owner-only.
  streaming.delete('/clips/:clipId', clipWriteRateLimit, (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { clipId } = c.req.param();
    const clip = db.getClip(clipId);
    if (!clip) return c.json({ code: 'clip_not_found', message: 'Clip not found' }, 404);
    const subject = requireAuthenticatedUser(c);
    if (clip.creatorId !== subject) return ownershipForbidden(c);
    db.deleteClip(clipId);
    return c.json({ ok: true });
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

    // The access check is viewer-facing (callers query their own
    // subscriberId), so it must not echo the creator's full allowlist.
    return c.json({
      streamId,
      visibility: stream.visibility,
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
    const ownerDenied = assertSelfCreator(c, streamId, parsed.creatorId);
    if (ownerDenied) return ownerDenied;

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
    const existingSession = db.getStreamSession(sessionId);
    if (!existingSession) return c.json({ code: 'session_not_found', message: 'Session not found' }, 404);
    const ownerDenied = requireStreamOwner(c, existingSession.streamId);
    if (ownerDenied) return ownerDenied;

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
    // Creator-private operational history — only the owning creator may read it.
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const ownerDenied = requireStreamOwner(c, c.req.param('streamId'));
    if (ownerDenied) return ownerDenied;
    return c.json(db.listStreamSessions(c.req.param('streamId')));
  });

  streaming.put('/streams/:streamId/moderation', async (c) => {
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const { streamId } = c.req.param();
    const ownerDenied = requireStreamOwner(c, streamId);
    if (ownerDenied) return ownerDenied;
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
    // Banned-user lists and keyword filters are moderation-integrity data —
    // only the owning creator may read them.
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;

    const streamId = c.req.param('streamId');
    const ownerDenied = requireStreamOwner(c, streamId);
    if (ownerDenied) return ownerDenied;
    return c.json(db.getStreamModeration(streamId) ?? { streamId, slowModeSeconds: 0, bannedUserIds: [], keywordFilters: [] });
  });

  streaming.get('/events', (c) => {
    // The streaming-wide domain event log spans every creator, so it stays
    // admin-only even though streaming.write is now universal.
    const claims = c.get('user') as { sub?: string; username?: string } | null;
    if (!claims?.sub) return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
    if (!isAdminUser(claims.sub, claims.username ?? '')) {
      return c.json({ code: 'forbidden', message: 'Admin privileges required' }, 403);
    }
    return c.json(listDomainEvents('streaming'));
  });

  streaming.get('/streams/:streamId/revenue', (c) => {
    // Creator earnings — only the owning creator may read them.
    const denied = requireDomainCapability(c, 'streaming', 'write');
    if (denied) return denied;
    const ownerDenied = requireStreamOwner(c, c.req.param('streamId'));
    if (ownerDenied) return ownerDenied;
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
