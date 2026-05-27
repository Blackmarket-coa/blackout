import { createHmac } from 'node:crypto';

/**
 * Twitch Extension Backend Service (EBS) JWT signer.
 *
 * Twitch extensions expect a JWT signed with the extension's shared secret
 * (HS256) carrying the viewer's role + an `opaque_user_id`. The `Twitch.ext`
 * SDK shim (client-side) calls `onAuthorized` with this token so an extension
 * bundle behaves the same against Blackout as it would on Twitch.
 *
 * We mint these from Blackout identities:
 *   - `opaque_user_id` is a stable, NON-reversible per-(viewer, channel) id —
 *     `'U' + HMAC-SHA256(extSecret, blackoutUserId + '|' + channelId)` — so an
 *     extension can recognize a returning viewer without learning who they are.
 *   - `user_id` is the viewer's REAL linked Twitch id, included only when the
 *     viewer has consented to identity-share (mirrors Twitch's id-share flow).
 *
 * Spec: https://dev.twitch.tv/docs/extensions/building/#signing-the-jwt
 */

export type TwitchExtRole = 'broadcaster' | 'moderator' | 'viewer';

export interface EbsPubsubPerms {
  listen?: string[];
  send?: string[];
}

export interface SignEbsJwtInput {
  /** The extension's shared secret (base64 or raw). HS256 signing key. */
  secret: string;
  /** Twitch-style channel id this token is scoped to. */
  channelId: string;
  /** The viewer's relationship to the channel. */
  role: TwitchExtRole;
  /** Blackout user id of the viewer; feeds the opaque-id HMAC. */
  blackoutUserId: string;
  /** Real Twitch user id — included ONLY when the viewer shared identity. */
  userId?: string;
  /** PubSub permissions to embed; defaults to listen on broadcast + channel. */
  pubsubPerms?: EbsPubsubPerms;
  /** Token lifetime. Defaults to 1 hour. */
  ttlSeconds?: number;
  /** Clock injection for tests. */
  now?: () => number;
}

const base64url = (input: string | Buffer): string =>
  Buffer.from(input).toString('base64url');

/**
 * Deterministic, non-reversible opaque viewer id. Twitch opaque ids are
 * prefixed `U` for an identified-or-anonymous logged-in viewer; we keep that
 * convention so extensions that string-match the prefix behave correctly.
 */
export const buildOpaqueUserId = (
  secret: string,
  blackoutUserId: string,
  channelId: string,
): string => {
  const mac = createHmac('sha256', secret)
    .update(`${blackoutUserId}|${channelId}`)
    .digest('hex');
  return `U${mac}`;
};

export interface SignedEbsToken {
  token: string;
  opaqueUserId: string;
  /** Unix seconds. */
  exp: number;
}

export const signEbsJwt = (input: SignEbsJwtInput): SignedEbsToken => {
  const nowMs = input.now ? input.now() : Date.now();
  const exp = Math.floor(nowMs / 1000) + (input.ttlSeconds ?? 3600);
  const opaqueUserId = buildOpaqueUserId(input.secret, input.blackoutUserId, input.channelId);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: Record<string, unknown> = {
    exp,
    channel_id: input.channelId,
    role: input.role,
    opaque_user_id: opaqueUserId,
    pubsub_perms: input.pubsubPerms ?? { listen: ['broadcast'], send: [] },
  };
  // Only present after identity-share consent; absence is meaningful (the
  // extension treats the viewer as not-identified).
  if (input.userId) payload.user_id = input.userId;

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', input.secret).update(signingInput).digest('base64url');
  return { token: `${signingInput}.${signature}`, opaqueUserId, exp };
};
