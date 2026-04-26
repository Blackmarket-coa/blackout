import { Hono } from 'hono';
import { db } from '../db/store';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

function createDeadDropRouter() {
  const deaddrop = new Hono();

  deaddrop.post('/', async (c) => {
    const denied = requireDomainCapability(c, 'deaddrop', 'write');
    if (denied) return denied;

    const payload = (await c.req.json()) as {
      channelId?: string;
      senderId?: string;
      recipientId?: string;
      payload?: string;
    };

    if (!payload.channelId || !payload.senderId || !payload.recipientId || !payload.payload) {
      return c.json({ code: 'invalid_request', message: 'channelId, senderId, recipientId and payload are required' }, 400);
    }

    const record = db.createDeadDrop({
      id: crypto.randomUUID(),
      channelId: payload.channelId,
      senderId: payload.senderId,
      recipientId: payload.recipientId,
      payload: payload.payload,
    });

    const event = emitDomainEvent({ module: 'deaddrop', type: 'deaddrop.created', payload: { dropId: record.id, recipientId: record.recipientId } });
    return c.json({ ...record, event }, 201);
  });

  deaddrop.post('/open', async (c) => {
    const denied = requireDomainCapability(c, 'deaddrop', 'write');
    if (denied) return denied;

    const payload = (await c.req.json()) as { deaddropId?: string; recipientId?: string };
    if (!payload.deaddropId || !payload.recipientId) {
      return c.json({ code: 'invalid_request', message: 'deaddropId and recipientId are required' }, 400);
    }

    const opened = db.openDeadDrop(payload.deaddropId, payload.recipientId);
    if (!opened) {
      return c.json({ code: 'deaddrop_not_found', message: 'Dead drop not found or recipient mismatch' }, 404);
    }

    const event = emitDomainEvent({ module: 'deaddrop', type: 'deaddrop.opened', payload: { dropId: opened.id, recipientId: opened.recipientId } });
    return c.json({ ...opened, event });
  });

  deaddrop.get('/events', (c) => {
    const denied = requireDomainCapability(c, 'deaddrop', 'read');
    if (denied) return denied;

    return c.json(listDomainEvents('deaddrop'));
  });

  return deaddrop;
}

export const deaddropModule: FeatureModule = {
  id: 'deaddrop',
  mountPath: '/deaddrop',
  registerRoutes: createDeadDropRouter,
};
