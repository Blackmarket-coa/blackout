import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Twitch EventSub webhook transport — signature verification + event
 * normalization. We don't yet manage subscriptions on Twitch's side
 * (Helix POST /eventsub/subscriptions); the receiver is the security-
 * critical foundation that the active-subscription manager will plug
 * into next.
 *
 * Spec:
 *   https://dev.twitch.tv/docs/eventsub/handling-webhook-events/
 *   https://dev.twitch.tv/docs/eventsub/eventsub-reference/
 *
 * Twitch signs each delivery with HMAC-SHA256 over
 *   message_id + message_timestamp + raw_body
 * using the per-subscription secret we chose at subscribe time. We MUST
 * verify the signature before parsing the body as JSON, otherwise an
 * attacker can poison our event handlers via a forged delivery.
 */

const HEADER_MESSAGE_ID = 'twitch-eventsub-message-id';
const HEADER_TIMESTAMP = 'twitch-eventsub-message-timestamp';
const HEADER_SIGNATURE = 'twitch-eventsub-message-signature';
const HEADER_TYPE = 'twitch-eventsub-message-type';
const HEADER_SUB_TYPE = 'twitch-eventsub-subscription-type';

/** Twitch caps replay windows at 10 minutes. */
const MAX_DELIVERY_AGE_MS = 10 * 60 * 1000;

export type TwitchEventSubMessageType =
  | 'webhook_callback_verification'
  | 'notification'
  | 'revocation';

export interface VerifyContext {
  /** Headers as a flat lower-cased map. Hono's `c.req.header()` returns this shape. */
  headers: Record<string, string | undefined>;
  /** RAW request body string (NOT parsed JSON — signature is over the bytes). */
  rawBody: string;
  /** Per-subscription secret chosen at subscribe time. */
  secret: string;
  /** Optional: override "now" for tests. */
  now?: () => number;
}

export type VerifyOutcome =
  | { kind: 'ok'; messageId: string; messageType: TwitchEventSubMessageType; subscriptionType: string }
  | { kind: 'missing_headers'; missing: string }
  | { kind: 'unknown_message_type'; received: string }
  | { kind: 'replay_rejected' }
  | { kind: 'signature_mismatch' };

const lower = (h: Record<string, string | undefined>, key: string): string | undefined =>
  h[key] ?? h[key.toLowerCase()];

const KNOWN_TYPES: readonly TwitchEventSubMessageType[] = [
  'webhook_callback_verification',
  'notification',
  'revocation',
];

const isKnownType = (s: string): s is TwitchEventSubMessageType =>
  (KNOWN_TYPES as readonly string[]).includes(s);

const constantTimeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * Verify a Twitch EventSub delivery. Returns a typed outcome describing
 * whether the request can be trusted; `kind === 'ok'` is the only path
 * that should result in any side effect.
 */
export const verifyEventSubMessage = (ctx: VerifyContext): VerifyOutcome => {
  const messageId = lower(ctx.headers, HEADER_MESSAGE_ID);
  const messageTimestamp = lower(ctx.headers, HEADER_TIMESTAMP);
  const messageSignature = lower(ctx.headers, HEADER_SIGNATURE);
  const messageType = lower(ctx.headers, HEADER_TYPE);
  const subscriptionType = lower(ctx.headers, HEADER_SUB_TYPE) ?? '';
  if (!messageId) return { kind: 'missing_headers', missing: HEADER_MESSAGE_ID };
  if (!messageTimestamp) return { kind: 'missing_headers', missing: HEADER_TIMESTAMP };
  if (!messageSignature) return { kind: 'missing_headers', missing: HEADER_SIGNATURE };
  if (!messageType) return { kind: 'missing_headers', missing: HEADER_TYPE };
  if (!isKnownType(messageType)) {
    return { kind: 'unknown_message_type', received: messageType };
  }

  // Replay window. Done BEFORE the signature compare because if Twitch's
  // header timestamp is unparseable / very old, the signature is moot.
  const now = ctx.now ? ctx.now() : Date.now();
  const sentAt = Date.parse(messageTimestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > MAX_DELIVERY_AGE_MS) {
    return { kind: 'replay_rejected' };
  }

  const hmac = createHmac('sha256', ctx.secret)
    .update(messageId)
    .update(messageTimestamp)
    .update(ctx.rawBody)
    .digest('hex');
  const expected = `sha256=${hmac}`;
  if (!constantTimeEqual(messageSignature, expected)) {
    return { kind: 'signature_mismatch' };
  }

  return { kind: 'ok', messageId, messageType, subscriptionType };
};

// ----------------------------- event normalization -----------------------------

/**
 * Subset of the EventSub `notification` body shape that we actually consume.
 * Twitch documents many more fields; we only project the ones the alerts
 * pipeline downstream cares about.
 */
export interface EventSubNotification {
  subscription: {
    id: string;
    type: string;
    version: string;
    status: string;
    cost: number;
    condition: Record<string, string>;
    created_at: string;
  };
  event: Record<string, unknown>;
}

export type NormalizedTwitchEvent =
  | {
      kind: 'follow';
      subscriptionType: 'channel.follow';
      twitchChannelId: string;
      followerLogin: string;
      followerDisplayName?: string;
      followerTwitchId: string;
      followedAt: string;
    }
  | {
      kind: 'subscribe';
      subscriptionType: 'channel.subscribe';
      twitchChannelId: string;
      subscriberLogin: string;
      subscriberDisplayName?: string;
      subscriberTwitchId: string;
      tier: '1000' | '2000' | '3000';
      isGift: boolean;
    }
  | {
      kind: 'subscription_gift';
      subscriptionType: 'channel.subscription.gift';
      twitchChannelId: string;
      gifterLogin: string;
      gifterDisplayName?: string;
      gifterTwitchId: string;
      total: number;
      tier: '1000' | '2000' | '3000';
      cumulativeTotal?: number;
      isAnonymous: boolean;
    }
  | {
      kind: 'cheer';
      subscriptionType: 'channel.cheer';
      twitchChannelId: string;
      cheererLogin?: string;
      cheererDisplayName?: string;
      cheererTwitchId?: string;
      bits: number;
      message: string;
      isAnonymous: boolean;
    }
  | {
      kind: 'raid';
      subscriptionType: 'channel.raid';
      fromChannelId: string;
      fromChannelLogin: string;
      fromChannelDisplayName?: string;
      toChannelId: string;
      viewers: number;
    };

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asInt = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};
const asBool = (v: unknown): boolean => v === true;
const asTier = (v: unknown): '1000' | '2000' | '3000' => {
  if (v === '1000' || v === '2000' || v === '3000') return v;
  return '1000';
};

/**
 * Project a verified EventSub notification body into our normalized event
 * shape. Returns null when the subscription type is not (yet) recognized.
 *
 * Adding a new subscription type is a one-liner here + a new union arm in
 * NormalizedTwitchEvent.
 */
export const normalizeEventSub = (
  body: EventSubNotification,
): NormalizedTwitchEvent | null => {
  const event = body.event ?? {};
  switch (body.subscription.type) {
    case 'channel.follow':
      return {
        kind: 'follow',
        subscriptionType: 'channel.follow',
        twitchChannelId: asString(event.broadcaster_user_id) ?? '',
        followerLogin: asString(event.user_login) ?? '',
        followerDisplayName: asString(event.user_name),
        followerTwitchId: asString(event.user_id) ?? '',
        followedAt: asString(event.followed_at) ?? '',
      };
    case 'channel.subscribe':
      return {
        kind: 'subscribe',
        subscriptionType: 'channel.subscribe',
        twitchChannelId: asString(event.broadcaster_user_id) ?? '',
        subscriberLogin: asString(event.user_login) ?? '',
        subscriberDisplayName: asString(event.user_name),
        subscriberTwitchId: asString(event.user_id) ?? '',
        tier: asTier(event.tier),
        isGift: asBool(event.is_gift),
      };
    case 'channel.subscription.gift':
      return {
        kind: 'subscription_gift',
        subscriptionType: 'channel.subscription.gift',
        twitchChannelId: asString(event.broadcaster_user_id) ?? '',
        gifterLogin: asString(event.user_login) ?? '',
        gifterDisplayName: asString(event.user_name),
        gifterTwitchId: asString(event.user_id) ?? '',
        total: asInt(event.total),
        tier: asTier(event.tier),
        cumulativeTotal:
          typeof event.cumulative_total === 'number' ? event.cumulative_total : undefined,
        isAnonymous: asBool(event.is_anonymous),
      };
    case 'channel.cheer':
      return {
        kind: 'cheer',
        subscriptionType: 'channel.cheer',
        twitchChannelId: asString(event.broadcaster_user_id) ?? '',
        cheererLogin: asString(event.user_login),
        cheererDisplayName: asString(event.user_name),
        cheererTwitchId: asString(event.user_id),
        bits: asInt(event.bits),
        message: asString(event.message) ?? '',
        isAnonymous: asBool(event.is_anonymous),
      };
    case 'channel.raid':
      return {
        kind: 'raid',
        subscriptionType: 'channel.raid',
        fromChannelId: asString(event.from_broadcaster_user_id) ?? '',
        fromChannelLogin: asString(event.from_broadcaster_user_login) ?? '',
        fromChannelDisplayName: asString(event.from_broadcaster_user_name),
        toChannelId: asString(event.to_broadcaster_user_id) ?? '',
        viewers: asInt(event.viewers),
      };
    default:
      return null;
  }
};
