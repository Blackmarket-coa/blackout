import type { WidgetAlertEvent, WidgetAlertOrigin } from '../../services/widgetBus';

/**
 * Map a WidgetAlertEvent (Streamlabs-shape envelope) to the
 * StreamElements OverlayWS realtime event shape so off-the-shelf
 * StreamElements browser-source overlay HTML drops in unchanged once
 * its endpoint URL is repointed at Blackout's SE shim.
 *
 * The SE realtime API delivers alert payloads as a single `event`
 * socket.io frame:
 *
 *   socket.emit('event', {
 *     type: 'tip' | 'follow' | 'subscriber' | 'cheer' | 'host' | 'raid' | 'subscriber-gift',
 *     provider: 'twitch' | 'youtube' | 'streamlabs' | 'patreon',
 *     data: { username, amount?, message?, currency?, tier?, count?, ... },
 *     _id: '<stable id>',
 *     createdAt: '<ISO>',
 *   })
 *
 * This adapter is a 1:1 projection from our Streamlabs-shape envelope
 * (which already carries the same data the SE wire shape needs). The
 * source of truth is `WidgetAlertEvent.message[0]` (Streamlabs-shape
 * payload) plus `WidgetAlertEvent.source` (full normalized event for
 * fields the Streamlabs envelope elides).
 */

export type SeEventType =
  | 'tip'
  | 'follow'
  | 'subscriber'
  | 'subscriber-gift'
  | 'cheer'
  | 'host'
  | 'raid';

export interface SeEventFrame {
  type: SeEventType;
  provider: WidgetAlertOrigin;
  data: Record<string, unknown>;
  _id: string;
  createdAt: string;
}

const firstString = (
  payload: Record<string, unknown>,
  ...keys: readonly string[]
): string | undefined => {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
};

/**
 * Convert one Blackout WidgetAlertEvent into one SE realtime `event`
 * frame. Returns `null` when the event has no SE counterpart (host
 * raids — Twitch deprecated them in 2022, so we never emit one).
 */
export const widgetEventToSeFrame = (
  evt: WidgetAlertEvent,
): SeEventFrame | null => {
  const payload = evt.message[0] ?? {};
  const _id = String(payload._id ?? `evt_${evt.publishedAtMs}`);
  const createdAt = new Date(evt.publishedAtMs).toISOString();
  const username = firstString(payload, 'name', 'display_name') ?? 'Anonymous';

  switch (evt.type) {
    case 'donation':
      return {
        type: 'tip',
        provider: evt.origin,
        data: {
          username,
          amount: Number(payload.amount ?? 0),
          currency: typeof payload.currency === 'string' ? payload.currency : 'USD',
          message: typeof payload.message === 'string' ? payload.message : '',
        },
        _id,
        createdAt,
      };
    case 'follow':
      return {
        type: 'follow',
        provider: evt.origin,
        data: { username },
        _id,
        createdAt,
      };
    case 'subscription': {
      const tier = typeof payload.sub_plan === 'string' ? payload.sub_plan : '1000';
      return {
        type: 'subscriber',
        provider: evt.origin,
        data: {
          username,
          tier,
          months: Number(payload.months ?? 0),
          gifted: payload.is_gift === true,
        },
        _id,
        createdAt,
      };
    }
    case 'subscription_gift': {
      const tier = typeof payload.sub_plan === 'string' ? payload.sub_plan : '1000';
      return {
        type: 'subscriber-gift',
        provider: evt.origin,
        data: {
          username,
          tier,
          // For gift subs, Blackout's source carries the gift count.
          // Default to 1 if missing.
          amount: extractGiftCount(evt) ?? 1,
        },
        _id,
        createdAt,
      };
    }
    case 'bits':
      return {
        type: 'cheer',
        provider: evt.origin,
        data: {
          username,
          amount: Number(payload.amount ?? 0),
          message: typeof payload.message === 'string' ? payload.message : '',
        },
        _id,
        createdAt,
      };
    case 'raid':
      return {
        type: 'raid',
        provider: evt.origin,
        data: {
          username,
          raiders: Number(payload.raiders ?? 0),
        },
        _id,
        createdAt,
      };
  }
};

const extractGiftCount = (evt: WidgetAlertEvent): number | undefined => {
  if (evt.source.kind === 'subscription_gift') return evt.source.total;
  return undefined;
};

export const __test__ = { firstString };
