import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import { getLinkedAccount } from '../services/linkedAccounts';
import { db } from '../db/store';
import { signEbsJwt, type TwitchExtRole } from '../integrations/twitch/ebsJwt';

/**
 * Twitch Extensions compat — EBS token endpoint.
 *
 * Hands the client-side `Twitch.ext` SDK shim a signed JWT so a Twitch
 * extension bundle can run against a Blackout livestream. The token carries a
 * Blackout-derived `opaque_user_id`, the viewer's `role`, and (only with
 * identity-share consent) the viewer's real linked Twitch `user_id`.
 *
 * MVP scope: panel surface. Role is broadcaster (the stream's creator) or
 * viewer; moderator detection (Matrix power-level >= 50) is a follow-up.
 */

const router = new Hono();
router.use('*', authRateLimit);

const readSecret = (): string | null => {
  const raw = (process.env.TWITCH_EXTENSION_SECRET ?? '').trim();
  return raw || null;
};

/**
 * Derive the Twitch-style channel id for a creator. Prefer their real linked
 * Twitch id (so an extension keying on channel id lines up with the creator's
 * actual channel); otherwise fall back to the deterministic Blackout id.
 */
const channelIdForCreator = (creatorId: string): string => {
  const link = getLinkedAccount(creatorId, 'twitch');
  return link?.providerUserId ?? creatorId;
};

/**
 * GET /token?streamId=...&shareIdentity=true
 *
 * Returns an EBS JWT for the calling viewer scoped to the stream's channel.
 */
router.get('/token', (c) => {
  const userOrResp = requireUser(c, 'Sign in to load stream extensions');
  if (userOrResp instanceof Response) return userOrResp;

  const secret = readSecret();
  if (!secret) {
    // Operator misconfiguration — recoverable, so 503 rather than a 4xx.
    return c.json(
      { code: 'extensions_not_configured', message: 'TWITCH_EXTENSION_SECRET is not set.' },
      503,
    );
  }

  const streamId = c.req.query('streamId');
  if (!streamId) {
    return c.json({ code: 'missing_stream_id', message: 'streamId is required.' }, 400);
  }
  const stream = db.getStream(streamId);
  if (!stream) {
    return c.json({ code: 'stream_not_found', message: 'No such stream.' }, 404);
  }

  const channelId = channelIdForCreator(stream.creatorId);
  const role: TwitchExtRole = userOrResp.sub === stream.creatorId ? 'broadcaster' : 'viewer';

  // Identity-share: only attach the real Twitch user_id when the viewer both
  // opted in AND has a linked Twitch account to share.
  const shareIdentity = c.req.query('shareIdentity') === 'true';
  const viewerTwitch = shareIdentity ? getLinkedAccount(userOrResp.sub, 'twitch') : null;

  const signed = signEbsJwt({
    secret,
    channelId,
    role,
    blackoutUserId: userOrResp.sub,
    userId: viewerTwitch?.providerUserId,
  });

  return c.json({
    token: signed.token,
    channelId,
    role,
    opaqueUserId: signed.opaqueUserId,
    userId: viewerTwitch?.providerUserId ?? null,
    expiresAt: new Date(signed.exp * 1000).toISOString(),
  });
});

export default router;
