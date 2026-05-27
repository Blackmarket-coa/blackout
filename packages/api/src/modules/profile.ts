import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireAuthenticatedUser, requireDomainCapability } from './authz';
import { emitDomainEvent } from './domain-events';
import {
    appendWallPost,
    getProfileOrDefault,
    listWallPosts,
    upsertProfile,
} from '../services/profileStore';
import type { FeatureModule } from './types';

const upsertSchema = z.object({
    displayName: z.string().min(1).max(120).optional(),
    avatarUrl: z.string().url().optional(),
    primaryRole: z.string().max(120).optional(),
    roleBadges: z.array(z.string().max(60)).max(20).optional(),
    mutualSpaces: z.array(z.string().max(120)).max(50).optional(),
    isFriend: z.boolean().optional(),
    profile: z.unknown().optional(),
});

const wallPostSchema = z.object({
    body: z.string().min(1).max(2000),
});

function createProfileRouter() {
    const profile = new Hono();

    profile.get('/:userId', (c) => {
        const denied = requireDomainCapability(c, 'profile', 'read');
        if (denied) return denied;
        const { userId } = c.req.param();
        return c.json(getProfileOrDefault(userId));
    });

    profile.put('/:userId', async (c) => {
        const denied = requireDomainCapability(c, 'profile', 'write');
        if (denied) return denied;

        const subject = requireAuthenticatedUser(c);
        const { userId } = c.req.param();
        if (subject !== userId) {
            return c.json(
                { code: 'forbidden', message: 'Cannot edit another user\'s profile' },
                403,
            );
        }

        const parsed = await readJsonBody(c, upsertSchema);
        if (parsed instanceof Response) return parsed;

        const member = upsertProfile(userId, parsed);
        const event = emitDomainEvent({
            module: 'profile',
            type: 'profile.updated',
            payload: { userId },
        });
        return c.json({ ...member, event });
    });

    profile.get('/:userId/wall', (c) => {
        const denied = requireDomainCapability(c, 'profile', 'read');
        if (denied) return denied;
        const { userId } = c.req.param();
        return c.json({ userId, posts: listWallPosts(userId) });
    });

    profile.post('/:userId/wall', async (c) => {
        const denied = requireDomainCapability(c, 'profile', 'write');
        if (denied) return denied;

        const author = requireAuthenticatedUser(c);
        if (!author) {
            return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
        }

        const parsed = await readJsonBody(c, wallPostSchema);
        if (parsed instanceof Response) return parsed;

        const { userId } = c.req.param();
        try {
            const post = appendWallPost({
                profileUserId: userId,
                authorId: author,
                body: parsed.body,
            });
            const event = emitDomainEvent({
                module: 'profile',
                type: 'profile.wall.posted',
                payload: { profileUserId: userId, postId: post.id, authorId: author },
            });
            return c.json({ ...post, event }, 201);
        } catch (error) {
            return c.json(
                { code: 'invalid_request', message: (error as Error).message },
                400,
            );
        }
    });

    return profile;
}

export const profileModule: FeatureModule = {
    id: 'profile',
    mountPath: '/profile',
    registerRoutes: createProfileRouter,
};
