import { Hono } from 'hono';
import { db } from '../db/store';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

function createModerationRouter() {
  const moderation = new Hono();

  moderation.post('/actions', async (c) => {
    const denied = requireDomainCapability(c, 'moderation', 'write');
    if (denied) return denied;

    const payload = (await c.req.json()) as {
      communityId?: string;
      actorId?: string;
      targetId?: string;
      action?: 'warn' | 'mute' | 'ban' | 'remove_content';
      reason?: string;
    };

    if (!payload.communityId || !payload.actorId || !payload.targetId || !payload.action || !payload.reason) {
      return c.json({ code: 'invalid_request', message: 'communityId, actorId, targetId, action and reason are required' }, 400);
    }

    const record = db.createModerationAction({
      id: crypto.randomUUID(),
      communityId: payload.communityId,
      actorId: payload.actorId,
      targetId: payload.targetId,
      action: payload.action,
      reason: payload.reason,
    });

    const event = emitDomainEvent({ module: 'moderation', type: 'moderation.action.taken', payload: { actionId: record.id, targetId: record.targetId, action: record.action } });
    return c.json({ ...record, event }, 201);
  });

  moderation.get('/actions', (c) => {
    const denied = requireDomainCapability(c, 'moderation', 'read');
    if (denied) return denied;

    const communityId = c.req.query('communityId');
    if (!communityId) {
      return c.json({ code: 'invalid_request', message: 'communityId query parameter is required' }, 400);
    }

    return c.json(db.listModerationActions(communityId));
  });

  moderation.get('/events', (c) => {
    const denied = requireDomainCapability(c, 'moderation', 'read');
    if (denied) return denied;

    return c.json(listDomainEvents('moderation'));
  });

  return moderation;
}

export const moderationModule: FeatureModule = {
  id: 'moderation',
  mountPath: '/moderation',
  registerRoutes: createModerationRouter,
};
