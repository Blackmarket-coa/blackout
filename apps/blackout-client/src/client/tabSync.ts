/**
 * Cross-tab synchronization utility using BroadcastChannel.
 *
 * Use this instead of window.addEventListener('storage', ...) for real-time
 * cross-tab sync. The `storage` event only fires in tabs OTHER than the
 * writing tab; BroadcastChannel fires in ALL tabs including the sender,
 * providing eventual consistency for multi-tab localStorage patterns.
 */

const CHANNEL_NAME = 'blackout-tab-sync';

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return channel;
}

export type TabSyncMessage = {
  type: string;
  key?: string;
  value?: unknown;
  timestamp: number;
};

type SyncHandler = (msg: TabSyncMessage) => void;

const handlers = new Map<string, Set<SyncHandler>>();

export function subscribeToTabSync(type: string, handler: SyncHandler): () => void {
  if (!handlers.has(type)) {
    handlers.set(type, new Set());
  }
  handlers.get(type)!.add(handler);

  const bc = getChannel();
  if (bc) {
    const listener = (event: MessageEvent) => {
      const msg = event.data as TabSyncMessage | undefined;
      if (msg && msg.type === type) {
        handler(msg);
      } else if (msg && msg.type === 'blackout-sync-all') {
        handler(msg);
      }
    };
    bc.addEventListener('message', listener);
    return () => {
      bc.removeEventListener('message', listener);
      handlers.get(type)?.delete(handler);
    };
  }

  return () => {
    handlers.get(type)?.delete(handler);
  };
}

export function notifyTabSync(type: string, payload?: Record<string, unknown>): void {
  const bc = getChannel();
  if (!bc) return;
  const msg: TabSyncMessage = {
    type,
    key: payload?.key as string | undefined,
    value: payload?.value,
    timestamp: Date.now(),
  };
  try {
    bc.postMessage(msg);
  } catch {
    // Channel may be closed — silently ignore
  }
}
