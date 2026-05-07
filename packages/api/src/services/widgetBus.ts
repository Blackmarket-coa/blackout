import type { NormalizedTwitchEvent } from '../integrations/twitch/eventSub';
import type { NormalizedPatreonEvent } from '../integrations/patreon/webhookEvents';
import type { NormalizedStreamlabsDonation } from '../integrations/streamlabs/donationEvents';

/**
 * In-process pub/sub of Streamlabs-shaped alert payloads, keyed by the
 * Blackout creator the alerts belong to. The EventSub route's default
 * forwarder publishes here whenever a Twitch notification verifies; the
 * widget SSE endpoint subscribes per-connection and streams payloads
 * back to OBS browser-source widgets.
 *
 * Single-process by design — multi-replica deployments will need a
 * fan-out shim (Redis pub/sub or Postgres LISTEN/NOTIFY) but Phase 1
 * runs single-replica behind nginx and this is sufficient.
 *
 * The payload shape mirrors Streamlabs's documented Socket API
 * (https://dev.streamlabs.com/docs/socket-api) so existing browser-source
 * alert widgets that consume `{type, message: [...]}` JSON drop in
 * unchanged once their endpoint URL is repointed at Blackout.
 */

/**
 * Alert types in our wire shape. Mirrors Streamlabs's documented event
 * types (donation, follow, subscription, host, bits, raid). We don't
 * currently emit `host` — Twitch deprecated host raids in 2022.
 */
export type WidgetAlertType =
  | 'follow'
  | 'subscription'
  | 'subscription_gift'
  | 'donation'
  | 'bits'
  | 'raid';

/** Origin platform that produced an alert. Drives widget styling. */
export type WidgetAlertOrigin = 'twitch' | 'patreon' | 'streamlabs';

/**
 * The wire shape for a single alert push. Streamlabs delivers messages as
 * `{type, message: [...]}` over socket.io; we publish the same envelope
 * over plain Server-Sent Events so OBS browser sources can consume them
 * without a socket.io client.
 */
export interface WidgetAlertEvent {
  type: WidgetAlertType;
  /** Origin platform — useful for clients that style by source. */
  origin: WidgetAlertOrigin;
  /** Server timestamp of when the bus saw the event, ms-since-epoch. */
  publishedAtMs: number;
  /** Streamlabs documents this as an array; we always emit length 1. */
  message: Array<Record<string, unknown>>;
  /**
   * The full normalized event that produced this payload — lets richer
   * Blackout-native widgets show stuff Streamlabs's shape elides (raid
   * viewer counts, sub tier numbers, Patreon tier titles, etc.).
   */
  source: NormalizedTwitchEvent | NormalizedPatreonEvent | NormalizedStreamlabsDonation;
}

type Subscriber = (event: WidgetAlertEvent) => void;

const subscribers = new Map<string, Set<Subscriber>>();

/**
 * Subscribe a per-connection callback for a Blackout creator's alerts.
 * Returns the unsubscribe function — callers must invoke it on
 * disconnect to avoid leaking memory across long-running streams.
 */
export const subscribe = (blackoutUserId: string, fn: Subscriber): (() => void) => {
  let set = subscribers.get(blackoutUserId);
  if (!set) {
    set = new Set();
    subscribers.set(blackoutUserId, set);
  }
  set.add(fn);
  return () => {
    const s = subscribers.get(blackoutUserId);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) subscribers.delete(blackoutUserId);
  };
};

export const publish = (
  blackoutUserId: string,
  event: WidgetAlertEvent,
): { delivered: number } => {
  const set = subscribers.get(blackoutUserId);
  if (!set || set.size === 0) return { delivered: 0 };
  let delivered = 0;
  for (const fn of [...set]) {
    try {
      fn(event);
      delivered += 1;
    } catch {
      // Subscriber errors are isolated — one bad listener doesn't break
      // delivery to the rest. The SSE handler logs its own errors at the
      // call site.
    }
  }
  return { delivered };
};

export const subscriberCount = (blackoutUserId: string): number =>
  subscribers.get(blackoutUserId)?.size ?? 0;

/** Used by tests + graceful shutdown. */
export const __test__ = { subscribers };

export const clearAllSubscribersForTest = (): void => {
  subscribers.clear();
};
