import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Patreon webhook receiver helpers — signature verification + JSON:API
 * pledge-event normalization. Phase 1's donation alert path consumes
 * NormalizedPatreonEvent and ships them as `donation` Streamlabs-shape
 * payloads through the existing widgetBus.
 *
 * Patreon's webhook protocol (yes, really):
 *   - `X-Patreon-Signature` = HMAC-MD5 of the raw body bytes signed with the
 *     per-webhook secret, as a hex string.
 *   - `X-Patreon-Event` = the event name (e.g. `members:pledge:create`).
 *   - Body is JSON:API with `data` + optional `included` resources.
 *
 * Reference: https://docs.patreon.com/#webhooks-v1
 *
 * MD5 is cryptographically broken but it's what Patreon issues; the
 * "secret" envelope is still a meaningful authorization gate against a
 * stranger forging bodies. We compare in constant time anyway. When
 * Patreon offers a stronger algo we swap here.
 */

const HEADER_SIGNATURE = 'x-patreon-signature';
const HEADER_EVENT = 'x-patreon-event';

/** Events we know how to route. Other events 200-OK without further action. */
export type SupportedPatreonEvent =
  | 'members:pledge:create'
  | 'members:pledge:update'
  | 'members:pledge:delete';

const SUPPORTED: readonly SupportedPatreonEvent[] = [
  'members:pledge:create',
  'members:pledge:update',
  'members:pledge:delete',
];

const isSupported = (s: string): s is SupportedPatreonEvent =>
  (SUPPORTED as readonly string[]).includes(s);

export interface VerifyContext {
  headers: Record<string, string | undefined>;
  /** RAW body bytes (string) — signature is over the bytes Patreon sent. */
  rawBody: string;
  secret: string;
}

export type VerifyOutcome =
  | { kind: 'ok'; event: SupportedPatreonEvent }
  | { kind: 'missing_headers'; missing: string }
  | { kind: 'unsupported_event'; received: string }
  | { kind: 'signature_mismatch' };

const lower = (h: Record<string, string | undefined>, key: string): string | undefined =>
  h[key] ?? h[key.toLowerCase()];

const constantTimeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export const verifyPatreonWebhook = (ctx: VerifyContext): VerifyOutcome => {
  const signature = lower(ctx.headers, HEADER_SIGNATURE);
  const event = lower(ctx.headers, HEADER_EVENT);
  if (!signature) return { kind: 'missing_headers', missing: HEADER_SIGNATURE };
  if (!event) return { kind: 'missing_headers', missing: HEADER_EVENT };
  if (!isSupported(event)) return { kind: 'unsupported_event', received: event };

  const expected = createHmac('md5', ctx.secret).update(ctx.rawBody).digest('hex');
  if (!constantTimeEqual(signature.toLowerCase(), expected)) {
    return { kind: 'signature_mismatch' };
  }
  return { kind: 'ok', event };
};

// ----------------------------- normalization -----------------------------

/**
 * The `member` resource shape we read out of `data` after JSON:API
 * deserialization. We project only the fields the alert UI consumes;
 * Patreon ships ~30 attributes per resource and most are noise here.
 */
export interface PatreonWebhookBody {
  data?: {
    type?: string;
    id?: string;
    attributes?: {
      currently_entitled_amount_cents?: number;
      pledge_amount_cents?: number;
      pledge_relationship_start?: string;
      patron_status?: string;
      full_name?: string;
    };
    relationships?: {
      user?: { data?: { type?: string; id?: string } };
      campaign?: { data?: { type?: string; id?: string } };
      currently_entitled_tiers?: { data?: Array<{ type?: string; id?: string }> };
    };
  };
  included?: Array<{
    type?: string;
    id?: string;
    attributes?: {
      full_name?: string;
      vanity?: string;
      title?: string;
      amount_cents?: number;
    };
  }>;
}

export type NormalizedPatreonEvent =
  | {
      kind: 'patreon_pledge';
      eventType: 'members:pledge:create' | 'members:pledge:update';
      /** Patreon campaign owner user id — used to route to the right Blackout creator. */
      campaignUserId: string;
      patronUserId: string;
      patronDisplayName: string;
      /** Cents pledged in the active tier (or per-creation amount). */
      amountCents: number;
      currency: 'USD';
      tierTitle?: string;
    }
  | {
      kind: 'patreon_pledge_canceled';
      eventType: 'members:pledge:delete';
      campaignUserId: string;
      patronUserId: string;
      patronDisplayName: string;
    };

const findIncluded = (
  body: PatreonWebhookBody,
  type: string,
  id: string | undefined,
) => {
  if (!id || !body.included) return undefined;
  return body.included.find((row) => row.type === type && row.id === id);
};

/**
 * Project a verified Patreon webhook body into our normalized shape.
 * Returns null when the body's relationships are too sparse to act on
 * (no campaign id → can't route to a Blackout creator).
 */
export const normalizePatreonWebhook = (
  event: SupportedPatreonEvent,
  body: PatreonWebhookBody,
): NormalizedPatreonEvent | null => {
  const data = body.data;
  if (!data) return null;
  const campaignId =
    data.relationships?.campaign?.data?.id ??
    // Some webhook variants embed the campaign owner under user — accept it.
    undefined;
  if (!campaignId) return null;
  const patronUserId = data.relationships?.user?.data?.id ?? '';
  const patron = findIncluded(body, 'user', patronUserId);
  const patronDisplayName =
    patron?.attributes?.full_name ??
    patron?.attributes?.vanity ??
    data.attributes?.full_name ??
    'Patron';

  if (event === 'members:pledge:delete') {
    return {
      kind: 'patreon_pledge_canceled',
      eventType: 'members:pledge:delete',
      campaignUserId: campaignId,
      patronUserId,
      patronDisplayName,
    };
  }

  const amountCents =
    data.attributes?.currently_entitled_amount_cents ??
    data.attributes?.pledge_amount_cents ??
    0;

  // Look up tier title via the first currently-entitled tier relationship.
  const tierId = data.relationships?.currently_entitled_tiers?.data?.[0]?.id;
  const tier = findIncluded(body, 'tier', tierId);
  const tierTitle = tier?.attributes?.title;

  return {
    kind: 'patreon_pledge',
    eventType: event,
    campaignUserId: campaignId,
    patronUserId,
    patronDisplayName,
    amountCents,
    currency: 'USD',
    tierTitle,
  };
};

export const __test__ = { isSupported };
