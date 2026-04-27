import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

const postSchema = z.object({
  communityId: z.string().min(1),
  channelId: z.string().optional(),
  authorId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

function createForumRouter() {
  const forum = new Hono();

  forum.post('/posts', async (c) => {
    const denied = requireDomainCapability(c, 'forum', 'write');
    if (denied) return denied;

    const parsed = await readJsonBody(c, postSchema);
    if (parsed instanceof Response) return parsed;

    const post = db.createForumPost({
      id: crypto.randomUUID(),
      communityId: parsed.communityId,
      channelId: parsed.channelId,
      authorId: parsed.authorId,
      title: parsed.title,
      body: parsed.body,
      tags: parsed.tags ?? [],
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
