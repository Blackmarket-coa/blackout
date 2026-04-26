import { Hono } from 'hono';
import { db } from '../db/store';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

function createForumRouter() {
  const forum = new Hono();

  forum.post('/posts', async (c) => {
    const denied = requireDomainCapability(c, 'forum', 'write');
    if (denied) return denied;

    const payload = (await c.req.json()) as {
      communityId?: string;
      channelId?: string;
      authorId?: string;
      title?: string;
      body?: string;
      tags?: string[];
    };

    if (!payload.communityId || !payload.authorId || !payload.title || !payload.body) {
      return c.json({ code: 'invalid_request', message: 'communityId, authorId, title and body are required' }, 400);
    }

    const post = db.createForumPost({
      id: crypto.randomUUID(),
      communityId: payload.communityId,
      channelId: payload.channelId,
      authorId: payload.authorId,
      title: payload.title,
      body: payload.body,
      tags: Array.isArray(payload.tags) ? payload.tags : [],
    });

    const event = emitDomainEvent({ module: 'forum', type: 'forum.post.created', payload: { postId: post.id, communityId: post.communityId } });
    return c.json({ ...post, event }, 201);
  });

  forum.get('/posts', (c) => {
    const denied = requireDomainCapability(c, 'forum', 'read');
    if (denied) return denied;

    const communityId = c.req.query('communityId');
    if (!communityId) {
      return c.json({ code: 'invalid_request', message: 'communityId query parameter is required' }, 400);
    }

    return c.json(db.listForumPosts(communityId));
  });

  forum.get('/events', (c) => {
    const denied = requireDomainCapability(c, 'forum', 'read');
    if (denied) return denied;

    return c.json(listDomainEvents('forum'));
  });

  return forum;
}

export const forumModule: FeatureModule = {
  id: 'forum',
  mountPath: '/forum',
  registerRoutes: createForumRouter,
};
