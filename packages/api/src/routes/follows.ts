import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { writeRateLimit } from '../middleware/rate-limit';
import {
  followCounts,
  followUser,
  isFollowing,
  listFollowers,
  listFollowing,
  unfollowUser,
  type FollowEdgeRecord,
} from '../services/follows';

const follows = new Hono();
follows.use('*', writeRateLimit);

const followSchema = z.object({
  followeeId: z.string().min(1).max(255),
});

const matrixUserIdFor = (username: string): string => {
  const domain = (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');
  return `@${username}:${domain}`;
};

/** Resolve a follow edge's *other* user id into a client-friendly shape. */
const resolveUser = (userId: string) => {
  const user = db.getUserById(userId);
  return {
    userId,
    username: user?.username ?? userId,
    // Matrix id lets the client fetch the user's profile/status/wall, which
    // are keyed in the Matrix-id space on the profile surface.
    matrixUserId: user ? matrixUserIdFor(user.username) : null,
  };
};

follows.post('/', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsed = await readJsonBody(c, followSchema);
  if (parsed instanceof Response) return parsed;

  if (!db.getUserById(parsed.followeeId)) {
    return c.json({ code: 'not_found', message: 'User not found' }, 404);
  }

  const outcome = followUser(user.sub, parsed.followeeId);
  if (outcome.kind === 'self') {
    return c.json({ code: 'invalid_request', message: 'You cannot follow yourself' }, 400);
  }
  return c.json({ ok: true, following: true, created: outcome.created }, outcome.created ? 201 : 200);
});

follows.delete('/:followeeId', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const removed = unfollowUser(user.sub, c.req.param('followeeId'));
  return c.json({ ok: true, following: false, removed });
});

follows.get('/following', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const rows: FollowEdgeRecord[] = listFollowing(user.sub);
  return c.json({ following: rows.map((r) => resolveUser(r.followeeId)) });
});

follows.get('/followers', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const rows: FollowEdgeRecord[] = listFollowers(user.sub);
  return c.json({ followers: rows.map((r) => resolveUser(r.followerId)) });
});

follows.get('/counts', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json(followCounts(user.sub));
});

follows.get('/status/:userId', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const target = c.req.param('userId');
  return c.json({
    isFollowing: isFollowing(user.sub, target),
    isFollowedBy: isFollowing(target, user.sub),
  });
});

export default follows;
