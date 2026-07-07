import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireAuthenticatedUser, requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

const createDropSchema = z.object({
    channelId: z.string().min(1),
    // `senderId` is derived from the authenticated session, never trusted from the
    // body. Accepted-but-ignored for backwards compatibility.
    senderId: z.string().min(1).optional(),
    recipientId: z.string().min(1),
    payload: z.string().min(1),
});

const openDropSchema = z.object({
    deaddropId: z.string().min(1),
    // `recipientId` is derived from the authenticated session so a caller can only
    // open drops addressed to themselves. Accepted-but-ignored for compatibility.
    recipientId: z.string().min(1).optional(),
});

function createDeadDropRouter() {
    const deaddrop = new Hono();

    deaddrop.post('/', async (c) => {
        const denied = requireDomainCapability(c, 'deaddrop', 'write');
        if (denied) return denied;

        const senderId = requireAuthenticatedUser(c);
        if (!senderId) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const parsed = await readJsonBody(c, createDropSchema);
        if (parsed instanceof Response) return parsed;

        const record = db.createDeadDrop({
            id: crypto.randomUUID(),
            channelId: parsed.channelId,
            senderId,
            recipientId: parsed.recipientId,
            payload: parsed.payload,
        });

        // Do not put `recipientId` in the domain-event feed: the events surface is
        // readable by any `deaddrop.read` holder, and leaking the drop→recipient
        // mapping is exactly what the open path must not depend on.
        const event = emitDomainEvent({
            module: 'deaddrop',
            type: 'deaddrop.created',
            payload: { dropId: record.id },
        });
        return c.json({ ...record, event }, 201);
    });

    deaddrop.post('/open', async (c) => {
        const denied = requireDomainCapability(c, 'deaddrop', 'write');
        if (denied) return denied;

        const recipientId = requireAuthenticatedUser(c);
        if (!recipientId) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const parsed = await readJsonBody(c, openDropSchema);
        if (parsed instanceof Response) return parsed;

        // Authorize on the authenticated recipient, not a body-supplied id, so a
        // caller can only open drops addressed to them.
        const opened = db.openDeadDrop(parsed.deaddropId, recipientId);
        if (!opened) {
            return c.json(
                {
                    code: 'deaddrop_not_found',
                    message: 'Dead drop not found or recipient mismatch',
                },
                404
            );
        }

        const event = emitDomainEvent({
            module: 'deaddrop',
            type: 'deaddrop.opened',
            payload: { dropId: opened.id },
        });
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
