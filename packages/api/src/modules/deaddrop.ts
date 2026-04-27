import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

const createDropSchema = z.object({
  channelId: z.string().min(1),
  senderId: z.string().min(1),
  recipientId: z.string().min(1),
  payload: z.string().min(1),
});

const openDropSchema = z.object({
  deaddropId: z.string().min(1),
  recipientId: z.string().min(1),
});

function createDeadDropRouter() {
  const deaddrop = new Hono();

  deaddrop.post('/', async (c) => {
    const denied = requireDomainCapability(c, 'deaddrop', 'write');
    if (denied) return denied;

    const parsed = await readJsonBody(c, createDropSchema);
    if (parsed instanceof Response) return parsed;

    const record = db.createDeadDrop({
      id: crypto.randomUUID(),
      channelId: parsed.channelId,
      senderId: parsed.senderId,
      recipientId: parsed.recipientId,
      payload: parsed.payload,
    });

    const event = emitDomainEvent({ module: 'deaddrop', type: 'deaddrop.created', payload: { dropId: record.id, recipientId: record.recipientId } });
    return c.json({ ...record, event }, 201);
  });

  deaddrop.post('/open', async (c) => {
    const denied = requireDomainCapability(c, 'deaddrop', 'write');
    if (denied) return denied;

    const parsed = await readJsonBody(c, openDropSchema);
    if (parsed instanceof Response) return parsed;

    const opened = db.openDeadDrop(parsed.deaddropId, parsed.recipientId);
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
