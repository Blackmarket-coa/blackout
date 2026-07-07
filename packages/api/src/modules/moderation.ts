import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireAuthenticatedUser, requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

const moderationActionSchema = z.object({
    communityId: z.string().min(1),
    // `actorId` is derived from the authenticated session, never trusted from the
    // body. Accepted-but-ignored for backwards compatibility.
    actorId: z.string().min(1).optional(),
    targetId: z.string().min(1),
    action: z.enum(['warn', 'mute', 'ban', 'remove_content', 'timeout', 'slowmode']),
    reason: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

function createModerationRouter() {
    const moderation = new Hono();

    moderation.post('/actions', async (c) => {
        const denied = requireDomainCapability(c, 'moderation', 'write');
        if (denied) return denied;

        const actorId = requireAuthenticatedUser(c);
        if (!actorId) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const parsed = await readJsonBody(c, moderationActionSchema);
        if (parsed instanceof Response) return parsed;

        // NOTE: per-community tenancy (that `actorId` may moderate `communityId`) is
        // not yet enforced — there is no membership/role model. Binding the actor to
        // the authenticated session closes actor spoofing; scoping to the community
        // is tracked as a follow-up.
        const record = db.createModerationAction({
            id: crypto.randomUUID(),
            communityId: parsed.communityId,
            actorId,
            targetId: parsed.targetId,
            action: parsed.action,
            reason: parsed.reason,
            ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
        });

        const event = emitDomainEvent({
            module: 'moderation',
            type: 'moderation.action.taken',
            payload: { actionId: record.id, targetId: record.targetId, action: record.action },
        });
        return c.json({ ...record, event }, 201);
    });

    moderation.get('/actions', (c) => {
        const denied = requireDomainCapability(c, 'moderation', 'read');
        if (denied) return denied;

        const communityId = c.req.query('communityId');
        if (!communityId) {
            return c.json(
                { code: 'invalid_request', message: 'communityId query parameter is required' },
                400
            );
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
