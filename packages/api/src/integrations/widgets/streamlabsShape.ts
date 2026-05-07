import type { NormalizedTwitchEvent } from '../twitch/eventSub';
import type { NormalizedPatreonEvent } from '../patreon/webhookEvents';
import type { NormalizedStreamlabsDonation } from '../streamlabs/donationEvents';
import type { WidgetAlertEvent, WidgetAlertType } from '../../services/widgetBus';

/**
 * Map a NormalizedTwitchEvent to the Streamlabs Socket API event shape so
 * existing browser-source alert widgets that consume Streamlabs's
 * `{type, message: [...]}` JSON drop in unchanged once they're pointed
 * at Blackout's SSE feed.
 *
 * The contract is intentionally minimal — only the fields existing
 * Streamlabs widgets read in practice. Richer Blackout-native overlays
 * can ignore the Streamlabs envelope and consume `event.source` (the
 * full normalized event) directly.
 *
 * Reference: https://dev.streamlabs.com/docs/socket-api
 */

const formatAmount = (n: number): string => n.toFixed(2);

interface StreamlabsFollow {
  type: 'twitch_account';
  name: string;
  id?: string;
  _id: string;
  created_at: string;
}

interface StreamlabsSubscription {
  name: string;
  display_name?: string;
  /** Streamlabs uses string month counts; first-time subs send "0". */
  months: string;
  /** Sub plan: `1000` / `2000` / `3000` / `Prime`. */
  sub_plan: string;
  /** "true" / "false" — Streamlabs encodes booleans as strings here. */
  gifter?: string;
  is_gift?: boolean;
  _id: string;
}

interface StreamlabsBits {
  name: string;
  amount: string; // bits as string per Streamlabs convention
  message: string;
  _id: string;
}

interface StreamlabsRaid {
  name: string;
  raiders: string; // viewer count, stringified
  _id: string;
}

const subscriberToStreamlabs = (
  event: Extract<NormalizedTwitchEvent, { kind: 'subscribe' }>,
  id: string,
): StreamlabsSubscription => ({
  name: event.subscriberLogin,
  display_name: event.subscriberDisplayName,
  months: '0',
  sub_plan: event.tier,
  is_gift: event.isGift,
  _id: id,
});

const giftToStreamlabs = (
  event: Extract<NormalizedTwitchEvent, { kind: 'subscription_gift' }>,
  id: string,
): StreamlabsSubscription => ({
  name: event.gifterLogin,
  display_name: event.gifterDisplayName,
  months: '0',
  sub_plan: event.tier,
  gifter: event.isAnonymous ? 'AnAnonymousGifter' : event.gifterLogin,
  is_gift: true,
  _id: id,
});

/**
 * Convert a normalized Twitch event into the Blackout widget envelope.
 * Returns null when the event has no Streamlabs equivalent (currently:
 * none — every NormalizedTwitchEvent maps to one of follow / subscription
 * / bits / raid).
 */
export const toWidgetAlert = (
  event: NormalizedTwitchEvent,
  options: { now?: () => number; idForEvent?: () => string } = {},
): WidgetAlertEvent | null => {
  const now = options.now ? options.now() : Date.now();
  // Stable per-event id used as Streamlabs `_id`. Phase 1 derives this
  // from the event's own platform id when available so re-deliveries
  // dedupe; otherwise a UUID is fine since Streamlabs widgets only use
  // `_id` for "have I seen this?" tracking, not authentication.
  const id =
    options.idForEvent?.() ?? (event.kind === 'cheer' || event.kind === 'follow' ? null : null) ?? buildEventId(event, now);

  const baseEnvelope = {
    origin: 'twitch' as const,
    publishedAtMs: now,
    source: event,
  };

  let type: WidgetAlertType;
  let message: Array<Record<string, unknown>>;
  switch (event.kind) {
    case 'follow':
      type = 'follow';
      message = [
        {
          type: 'twitch_account',
          name: event.followerDisplayName ?? event.followerLogin,
          id: event.followerTwitchId,
          _id: id,
          created_at: event.followedAt,
        } satisfies StreamlabsFollow,
      ];
      break;
    case 'subscribe':
      type = 'subscription';
      message = [subscriberToStreamlabs(event, id)];
      break;
    case 'subscription_gift':
      type = 'subscription_gift';
      message = [giftToStreamlabs(event, id)];
      break;
    case 'cheer':
      type = 'bits';
      message = [
        {
          name: event.cheererDisplayName ?? event.cheererLogin ?? 'AnAnonymousCheerer',
          amount: String(event.bits),
          message: event.message,
          _id: id,
        } satisfies StreamlabsBits,
      ];
      break;
    case 'raid':
      type = 'raid';
      message = [
        {
          name: event.fromChannelDisplayName ?? event.fromChannelLogin,
          raiders: String(event.viewers),
          _id: id,
        } satisfies StreamlabsRaid,
      ];
      break;
    default: {
      const exhaustive: never = event;
      void exhaustive;
      return null;
    }
  }

  return { type, message, ...baseEnvelope };
};

// ----------------------------- Patreon → donation -----------------------------

interface StreamlabsDonation {
  name: string;
  /** Streamlabs uses a string with 2-decimal-place currency formatting. */
  amount: string;
  formatted_amount: string;
  currency: string;
  message: string;
  _id: string;
}

const formatDollarString = (cents: number): string =>
  (cents / 100).toFixed(2);

/**
 * Convert a normalized Patreon event into the Blackout widget envelope.
 * Pledge create / update become Streamlabs `donation` payloads (so any
 * existing donation overlay fires unchanged); cancellations don't have a
 * Streamlabs counterpart and return null — Blackout-native widgets can
 * subscribe to the underlying source if they want to render those.
 */
export const toWidgetAlertFromPatreon = (
  event: NormalizedPatreonEvent,
  options: { now?: () => number } = {},
): WidgetAlertEvent | null => {
  const now = options.now ? options.now() : Date.now();
  if (event.kind !== 'patreon_pledge') return null;
  const id = `pat_pledge_${event.campaignUserId}_${event.patronUserId}_${event.amountCents}_${now}`;
  const amount = formatDollarString(event.amountCents);
  const message: StreamlabsDonation = {
    name: event.patronDisplayName,
    amount,
    formatted_amount: `$${amount}`,
    currency: event.currency,
    message: event.tierTitle ? `Pledged at tier "${event.tierTitle}"` : 'New patron pledge',
    _id: id,
  };
  return {
    type: 'donation',
    origin: 'patreon',
    publishedAtMs: now,
    message: [message satisfies Record<string, unknown>],
    source: event,
  };
};

// ----------------------------- Streamlabs → donation -----------------------------

/**
 * Map a normalized Streamlabs donation directly into our donation
 * envelope. The Streamlabs Socket API delivers the SAME shape we emit on
 * the Blackout SSE feed — so this is mostly a 1:1 projection. The point
 * of routing it through here at all (vs publishing the raw Streamlabs
 * payload) is to keep `WidgetAlertEvent.source` typed: native Blackout
 * overlays read `source.kind === 'streamlabs_donation'` and get the
 * full normalized shape, while existing Streamlabs widgets see only the
 * `message[0]` envelope and don't notice we're middlemanned.
 */
export const toWidgetAlertFromStreamlabs = (
  event: NormalizedStreamlabsDonation,
  options: { now?: () => number } = {},
): WidgetAlertEvent => {
  const now = options.now ? options.now() : Date.now();
  const formattedAmount = `${currencySymbol(event.currency)}${event.amount}`;
  return {
    type: 'donation',
    origin: 'streamlabs',
    publishedAtMs: now,
    message: [
      {
        name: event.donorName,
        amount: event.amount,
        formatted_amount: formattedAmount,
        currency: event.currency,
        message: event.message,
        // Streamlabs widgets dedupe on `_id`; the Streamlabs donation id
        // is the natural unique key.
        _id: event.donationId,
      },
    ],
    source: event,
  };
};

const currencySymbol = (currency: string): string => {
  switch (currency.toUpperCase()) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'JPY':
      return '¥';
    default:
      return `${currency.toUpperCase()} `;
  }
};

/**
 * Stable per-event id. We prefer Twitch-side ids when the event carries
 * one so a deduping client (Streamlabs widgets keep a small Set of seen
 * ids) doesn't render a re-delivery as a second alert.
 */
const buildEventId = (event: NormalizedTwitchEvent, fallbackMs: number): string => {
  switch (event.kind) {
    case 'follow':
      return `tw_follow_${event.twitchChannelId}_${event.followerTwitchId}_${event.followedAt}`;
    case 'subscribe':
      return `tw_sub_${event.twitchChannelId}_${event.subscriberTwitchId}_${event.tier}`;
    case 'subscription_gift':
      return `tw_giftsub_${event.twitchChannelId}_${event.gifterTwitchId}_${fallbackMs}`;
    case 'cheer':
      return `tw_bits_${event.twitchChannelId}_${event.cheererTwitchId ?? 'anon'}_${event.bits}_${fallbackMs}`;
    case 'raid':
      return `tw_raid_${event.fromChannelId}_${event.toChannelId}_${event.viewers}`;
  }
};

/** Re-export used by tests + alert-overlay docs. */
export const __test__ = { formatAmount, buildEventId };
