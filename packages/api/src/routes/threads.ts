import { Hono } from 'hono';
import type { ThreadActivityUpdatedEvent } from '@blackout/protocol';
import { requireUser } from '../middleware/require-user';
import {
    listThreadActivity,
    markThreadActivityRead,
} from '../services/threadActivityStore';

const threads = new Hono();

threads.get('/activity', (c) => {
    const user = requireUser(c, 'Sign in to view thread activity');
    if (user instanceof Response) return user;

    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const sinceIso = c.req.query('since') ?? undefined;

    const activities = listThreadActivity(user.sub, {
        limit: typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : undefined,
        sinceIso,
    });
    return c.json({ subject: user.sub, activities });
});

threads.post('/activity/:activityId/read', (c) => {
    const user = requireUser(c, 'Sign in to update thread activity');
    if (user instanceof Response) return user;

    const { activityId } = c.req.param();
    const payload = markThreadActivityRead(user.sub, activityId);
    const event: ThreadActivityUpdatedEvent = {
        event: 'blackout.thread.activity.updated',
        roomId: payload.roomId,
        senderId: user.sub,
        occurredAt: payload.occurredAt,
        payload,
    };
    return c.json(event);
});

export default threads;
