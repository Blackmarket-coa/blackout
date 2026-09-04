// The Circle graph — the inner of the feed's two rings.
//
// Following someone puts them in *your* Circle and needs no approval from them.
// When two people follow each other their circles **overlap**; that is the only
// thing "mutual" means here, it is derived from the two edges on read, and there
// is no request/accept handshake to get wrong.
//
// `/v1/follows` is mounted on this same router (see routes/follows.ts) so every
// pre-Circle client keeps working on identical paths.
import { Hono } from 'hono';
import { z } from 'zod';
import { computeIllumination, type RelayLink } from '@blackout/core';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { matrixUserIdFor, resolveBlackoutUserId } from '../services/userIdentity';
import {
    circlesOverlap,
    followCounts,
    followUser,
    isFollowing,
    listFollowers,
    listFollowing,
    mutualsOf,
    unfollowUser,
    type FollowEdgeRecord,
} from '../services/follows';

const circle = new Hono();

const followSchema = z.object({
    followeeId: z.string().min(1).max(255),
});

/** Resolve the *other* user in an edge into a client-friendly shape. */
const resolveUser = (userId: string) => {
    const user = db.getUserById(userId);
    return {
        userId,
        username: user?.username ?? userId,
        // Matrix id lets the client fetch the user's profile/status/wall, which
        // are keyed in the Matrix-id space on the profile surface.
        matrixUserId: matrixUserIdFor(userId),
    };
};

circle.post('/', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, followSchema);
    if (parsed instanceof Response) return parsed;

    const followeeId = resolveBlackoutUserId(parsed.followeeId);
    if (!followeeId) {
        return c.json({ code: 'not_found', message: 'User not found' }, 404);
    }

    const outcome = followUser(user.sub, followeeId);
    if (outcome.kind === 'self') {
        return c.json({ code: 'invalid_request', message: 'You cannot follow yourself' }, 400);
    }
    return c.json(
        {
            ok: true,
            following: true,
            created: outcome.created,
            // Surfaced so the client can render "your circles overlap" the moment
            // a follow closes the loop, without a second round trip.
            overlaps: circlesOverlap(user.sub, followeeId),
        },
        outcome.created ? 201 : 200
    );
});

circle.delete('/:followeeId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const removed = unfollowUser(user.sub, c.req.param('followeeId'));
    return c.json({ ok: true, following: false, removed });
});

circle.get('/following', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const rows: FollowEdgeRecord[] = listFollowing(user.sub);
    return c.json({ following: rows.map((r) => resolveUser(r.followeeId)) });
});

circle.get('/followers', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const rows: FollowEdgeRecord[] = listFollowers(user.sub);
    return c.json({ followers: rows.map((r) => resolveUser(r.followerId)) });
});

circle.get('/counts', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json(followCounts(user.sub));
});

circle.get('/status/:userId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const target = c.req.param('userId');
    return c.json({
        isFollowing: isFollowing(user.sub, target),
        isFollowedBy: isFollowing(target, user.sub),
        overlaps: circlesOverlap(user.sub, target),
    });
});

/** People whose Circle overlaps yours — the two-way edges, resolved. */
circle.get('/mutuals', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ mutuals: mutualsOf(user.sub).map(resolveUser) });
});

/**
 * The Illumination meter: how much of the network this person's presence lights
 * up. Returns the unlit remainder explicitly — unlit areas are shown as unlit,
 * not hidden, which is the honest nudge to connect.
 */
circle.get('/illumination', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const allRelays = [...db.relayEdges.values()] as RelayLink[];
    const ownRelays = allRelays.filter((e) => e.relayerUserId === user.sub);

    return c.json(
        computeIllumination({
            following: listFollowing(user.sub).map((e) => e.followeeId),
            followers: listFollowers(user.sub).map((e) => e.followerId),
            ownRelays,
            allRelays,
            networkSize: db.users.size,
        })
    );
});

export default circle;
