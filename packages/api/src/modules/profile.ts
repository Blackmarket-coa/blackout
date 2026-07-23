import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireAuthenticatedUser, requireDomainCapability } from './authz';
import { emitDomainEvent } from './domain-events';
import { db } from '../db/store';
import {
    appendWallPost,
    getProfileOrDefault,
    listWallPosts,
    upsertProfile,
} from '../services/profileStore';
import type { FeatureModule } from './types';

/** MXID localpart extractor (`@localpart:domain` → `localpart`). */
const MXID_LOCALPART_RE = /^@([^:]+):[^:]+$/;

/**
 * Profiles are keyed in the Matrix-id space (`@user:domain`): the client edits
 * its own profile at `/v1/profile/@me:domain` (using `mx.getUserId()`), and
 * follows/search resolve other users' profiles the same way — see follows.ts,
 * "profile/status/wall are keyed in the Matrix-id space". Session JWTs, by
 * contrast, identify the caller by their Blackout user id (`sub`, a UUID) plus
 * their username (the Matrix localpart), so a literal `sub === userId` check can
 * never match a self-edit and always 403s ("cannot save profile information").
 *
 * Ownership holds when the path is the subject itself (blackout-id-keyed callers
 * and the integration tests) OR the path MXID's localpart equals the caller's
 * username. We match on the localpart — not a reconstructed `@username:domain`
 * — on purpose: the homeserver domain is a deploy-time env var
 * (`MATRIX_HOMESERVER_DOMAIN`, set from `PRIMARY_DOMAIN`) that must equal
 * Synapse's `server_name`; if it's unset or wrong, reconstructing the full MXID
 * wrongly locks a user out of their OWN profile. The signed JWT already proves
 * the caller is `username` on this homeserver, and on a single homeserver the
 * localpart uniquely identifies them, so a localpart match is both sufficient
 * and immune to that misconfiguration.
 */
function subjectOwnsProfile(c: Context, userId: string): boolean {
    const claims = c.get('user') as { sub?: string; username?: string } | null;
    const sub = claims?.sub;
    if (!sub) return false;
    if (sub === userId) return true;
    const username = claims?.username ?? db.getUserById(sub)?.username;
    if (!username) return false;
    return MXID_LOCALPART_RE.exec(userId)?.[1] === username;
}

// Blank strings mean "keep the stored value": clients seed empty fields as ''
// and a hard .min(1)/.url() failure would 400 the whole save.
const blankToUndefined = (value: unknown) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value;

const upsertSchema = z.object({
    displayName: z.preprocess(blankToUndefined, z.string().min(1).max(120).optional()),
    avatarUrl: z.preprocess(blankToUndefined, z.string().url().optional()),
    primaryRole: z.preprocess(blankToUndefined, z.string().max(120).optional()),
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

    // Zero-auth public projection backing the public creator profile page
    // (theblackout.app/@handle). No capability gate — anyone can read a profile
    // the owner has opted into publishing. Returns 404 unless `public: true`,
    // and strips contact connections so they never leak on the public surface.
    profile.get('/:userId/public', (c) => {
        const { userId } = c.req.param();
        const member = getProfileOrDefault(userId);
        if (member.profile.public !== true) {
            return c.json({ code: 'not_found', message: 'Profile not found' }, 404);
        }
        const p = member.profile;
        // Contact connections (email/phone) only ever arrive as raw strings via
        // the sanitizer's cast; never expose them on the public surface.
        const connections = (p.connections ?? []).filter(
            (conn) => (conn.type as string) !== 'email' && (conn.type as string) !== 'phone'
        );
        c.header('Cache-Control', 'public, max-age=60');
        return c.json({
            userId: member.userId,
            displayName: member.displayName,
            avatarUrl: member.avatarUrl,
            primaryRole: member.primaryRole,
            roleBadges: member.roleBadges,
            memberSince: member.memberSince,
            profile: {
                bio: p.bio,
                pronouns: p.pronouns,
                banner: p.banner,
                decoration: p.decoration,
                public: true,
                sponsors: p.sponsors,
                featuredCanopies: p.featuredCanopies,
                badgeIds: p.badgeIds,
                connections,
            },
        });
    });

    profile.put('/:userId', async (c) => {
        const denied = requireDomainCapability(c, 'profile', 'write');
        if (denied) return denied;

        const { userId } = c.req.param();
        if (!subjectOwnsProfile(c, userId)) {
            return c.json(
                { code: 'forbidden', message: "Cannot edit another user's profile" },
                403
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
            return c.json({ code: 'invalid_request', message: (error as Error).message }, 400);
        }
    });

    return profile;
}

export const profileModule: FeatureModule = {
    id: 'profile',
    mountPath: '/profile',
    registerRoutes: createProfileRouter,
};
