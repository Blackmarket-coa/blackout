import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { rateLimit } from '../middleware/rate-limit';
import { getLinkedAccount } from '../services/linkedAccounts';
import { db } from '../db/store';
import type {
  CreatorSubscriptionRecord,
  StreamRecord,
  UserRecord,
} from '../db/types';

/**
 * Twitch Helix read-proxy.
 *
 * Presents a subset of the Twitch Helix REST API shape backed by Blackout's
 * own data, so existing Helix consumers (bot dashboards, schedule pullers)
 * can read a creator's identity / stream / subscriber state from Blackout
 * without code changes. This proxy never calls Twitch — it translates
 * Blackout records into Helix-shaped envelopes.
 *
 * READ-ONLY: every write verb is denied with 403. Helix endpoints that have
 * no Blackout equivalent are simply not mounted.
 *
 * Auth: the calling Blackout user is resolved from the session (NOT a Twitch
 * app token), and only the caller's own data is ever returned. The caller's
 * linked Twitch account supplies the Helix `id` / `login` fields when present.
 */

const router = new Hono();

// A read proxy backs polling tooling, so use the general (120/min) limiter
// rather than the stricter auth bucket.
router.use('*', rateLimit);

// Map a Blackout subscription-tier price to a Twitch sub-plan code. Twitch only
// has three tiers; bucket Blackout's arbitrary pricing into the nearest one.
const tierCodeForPriceCents = (priceCents: number): '1000' | '2000' | '3000' => {
  if (priceCents >= 2499) return '3000';
  if (priceCents >= 999) return '2000';
  return '1000';
};

const helixLogin = (
  link: { providerUsername?: string } | null,
  user: UserRecord,
): { login: string; displayName: string } => {
  const display = link?.providerUsername ?? user.username;
  return { login: display.toLowerCase(), displayName: display };
};

/**
 * GET /users — returns the caller as a single Helix user object. Twitch's real
 * endpoint accepts `id`/`login` filters; we ignore them and always return the
 * authenticated caller, since this proxy only exposes the caller's own data.
 */
router.get('/users', (c) => {
  const userOrResp = requireUser(c, 'Sign in to read your Twitch-compatible profile');
  if (userOrResp instanceof Response) return userOrResp;
  const user = db.getUserById(userOrResp.sub);
  if (!user) return c.json({ code: 'user_not_found', message: 'No such user.' }, 404);

  const link = getLinkedAccount(user.id, 'twitch');
  const { login, displayName } = helixLogin(link, user);
  return c.json({
    data: [
      {
        // Prefer the real linked Twitch id so downstream tooling keying on it
        // still works; fall back to the Blackout id when no account is linked.
        id: link?.providerUserId ?? user.id,
        login,
        display_name: displayName,
        type: '',
        broadcaster_type: '',
        description: '',
        created_at: user.createdAt,
      },
    ],
  });
});

const streamToHelix = (
  stream: StreamRecord,
  userId: string,
  login: string,
  displayName: string,
): Record<string, unknown> => ({
  id: stream.id,
  user_id: userId,
  user_login: login,
  user_name: displayName,
  game_id: '',
  game_name: stream.category ?? '',
  type: 'live',
  title: stream.title,
  viewer_count: 0,
  // Blackout's StreamRecord doesn't persist an exact go-live timestamp; the
  // last update while live is the best available proxy.
  started_at: stream.updatedAt,
  language: '',
  thumbnail_url: '',
  tags: stream.tags,
  is_mature: false,
});

/**
 * GET /streams — Twitch's endpoint returns only currently-live streams, so we
 * filter the caller's streams to `state === 'live'`.
 */
router.get('/streams', (c) => {
  const userOrResp = requireUser(c, 'Sign in to read your Twitch-compatible streams');
  if (userOrResp instanceof Response) return userOrResp;
  const user = db.getUserById(userOrResp.sub);
  if (!user) return c.json({ code: 'user_not_found', message: 'No such user.' }, 404);

  const link = getLinkedAccount(user.id, 'twitch');
  const { login, displayName } = helixLogin(link, user);
  const userId = link?.providerUserId ?? user.id;
  const live = db
    .listStreamsByCreator(user.id)
    .filter((s) => s.state === 'live')
    .map((s) => streamToHelix(s, userId, login, displayName));
  return c.json({ data: live, pagination: {} });
});

const subscriptionToHelix = (
  sub: CreatorSubscriptionRecord,
  broadcasterId: string,
  broadcasterLogin: string,
  broadcasterName: string,
): Record<string, unknown> | null => {
  const tier = db.getCreatorSubscriptionTier(sub.tierId);
  if (!tier) return null;
  const subscriber = db.getUserById(sub.subscriberUserId);
  const subLogin = (subscriber?.username ?? sub.subscriberUserId).toLowerCase();
  const subName = subscriber?.username ?? sub.subscriberUserId;
  return {
    broadcaster_id: broadcasterId,
    broadcaster_login: broadcasterLogin,
    broadcaster_name: broadcasterName,
    gifter_id: '',
    gifter_login: '',
    gifter_name: '',
    is_gift: false,
    tier: tierCodeForPriceCents(tier.priceCents),
    plan_name: tier.name,
    user_id: sub.subscriberUserId,
    user_login: subLogin,
    user_name: subName,
  };
};

/**
 * GET /subscriptions — the broadcaster's active subscribers, mapped from
 * Blackout creator-subscriptions. Twitch's real endpoint reports the
 * broadcaster's own sub list, which is what we return for the caller.
 */
router.get('/subscriptions', (c) => {
  const userOrResp = requireUser(c, 'Sign in to read your Twitch-compatible subscribers');
  if (userOrResp instanceof Response) return userOrResp;
  const user = db.getUserById(userOrResp.sub);
  if (!user) return c.json({ code: 'user_not_found', message: 'No such user.' }, 404);

  const link = getLinkedAccount(user.id, 'twitch');
  const { login, displayName } = helixLogin(link, user);
  const broadcasterId = link?.providerUserId ?? user.id;
  const data = db
    .listCreatorSubscriptionsForCreator(user.id)
    .filter((s) => s.status === 'active')
    .map((s) => subscriptionToHelix(s, broadcasterId, login, displayName))
    .filter((row): row is Record<string, unknown> => row !== null);
  return c.json({ data, total: data.length, points: 0, pagination: {} });
});

/**
 * Any non-GET verb is a write. This proxy is read-only — deny rather than
 * silently 404, so a consumer attempting a write gets an unambiguous signal.
 */
router.on(['POST', 'PUT', 'PATCH', 'DELETE'], '*', (c) =>
  c.json(
    {
      code: 'helix_write_denied',
      message: 'The Blackout Helix proxy is read-only; writes are not supported.',
    },
    403,
  ),
);

export default router;
