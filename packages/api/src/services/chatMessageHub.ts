/**
 * In-process pub/sub for normalised chat messages.
 *
 * Sources (chat bridges) call {@link publishChatMessage} once per inbound
 * message — alongside their existing Matrix forwarding and outbound
 * webhook dispatch. Sinks (the Twitch IRC bot shim, future OBS-WS shim,
 * future Discord-compat gateway) call {@link subscribeChatMessages} to
 * receive the same firehose.
 *
 * Keying is `(blackoutUserId, channelKey)` where `channelKey` is the
 * channel-shape opaque string the SOURCE uses — e.g. Twitch's `#login`
 * with the `#` prefix, or `kick:<chatroom-id>`. Sinks subscribe to the
 * keys they care about; nothing's cross-platform-translated here.
 *
 * Memory shape: a single Map of subscribers per (user, channel) lets
 * multiple bots JOIN the same channel without duplicating fan-out work.
 * Subscribers are removed by the disposer returned from subscribe().
 */

export interface HubChatMessage {
  /** Origin platform: `twitch` | `youtube` | `kick` | `matrix-internal`. */
  source: string;
  /** Lowercased login / username on the source platform. */
  authorLogin: string;
  /** Optional display name (falls back to authorLogin). */
  authorDisplayName?: string;
  /** Plain-text body. */
  body: string;
  /** Source-platform message id, when available — used by sinks for dedup. */
  platformMessageId?: string;
  /** Free-form bag of IRCv3-shaped tag values the sink can pass through. */
  tags?: Record<string, string>;
}

export type ChatMessageListener = (msg: HubChatMessage) => void;

interface ChannelKey {
  blackoutUserId: string;
  channelKey: string;
}

const subscribers = new Map<string, Set<ChatMessageListener>>();

const compositeKey = (k: ChannelKey): string => `${k.blackoutUserId}::${k.channelKey}`;

export const publishChatMessage = (
  key: ChannelKey,
  msg: HubChatMessage,
): void => {
  const listeners = subscribers.get(compositeKey(key));
  if (!listeners || listeners.size === 0) return;
  for (const listener of [...listeners]) {
    try {
      listener(msg);
    } catch {
      // A misbehaving sink must not block the hub. Failures are logged
      // by the sink itself; we just skip past.
    }
  }
};

export interface SubscribeOptions {
  key: ChannelKey;
  listener: ChatMessageListener;
}

/** Returns a disposer that removes the listener. Idempotent. */
export const subscribeChatMessages = (options: SubscribeOptions): (() => void) => {
  const k = compositeKey(options.key);
  let set = subscribers.get(k);
  if (!set) {
    set = new Set();
    subscribers.set(k, set);
  }
  set.add(options.listener);
  return () => {
    const current = subscribers.get(k);
    if (!current) return;
    current.delete(options.listener);
    if (current.size === 0) subscribers.delete(k);
  };
};

export const __test__ = {
  subscribers,
  reset: () => subscribers.clear(),
};
