/**
 * WHAT THIS FILE DOES
 * Keeps multiple browser tabs of the Blackout app in sync. When you
 * change a setting in one tab, the other tabs see the change
 * immediately — no refresh needed.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * Without cross-tab sync, two tabs could have conflicting state:
 * - Tab A changes the theme → Tab B still shows the old theme.
 * - Tab A encrypts a session → Tab B reads stale localStorage and
 *   overwrites it with the old data (data loss).
 * - More critically: Tab A logs out → Tab B still has the access
 *   token in memory and keeps making authenticated requests.
 *
 * The browser's built-in 'storage' event only fires in OTHER tabs
 * (never the tab that made the change), which makes it unreliable for
 * immediate consistency. BroadcastChannel fires in ALL tabs including
 * the sender, making it better for real-time sync.
 *
 * HOW IT WORKS
 * 1. `subscribeToTabSync(type, handler)` — Listen for a specific
 *    message type (e.g., 'session-cleared', 'settings-changed').
 * 2. `notifyTabSync(type, payload)` — Send a message to all tabs.
 * 3. When a handler is subscribed, it registers a BroadcastChannel
 *    listener. The return value is an unsubscribe function.
 *
 * KEY CONCEPT — BroadcastChannel vs localStorage 'storage' event
 * - `storage` event: fires only in OTHER tabs. Good for eventual
 *   consistency (changes will propagate eventually). Bad for
 *   immediate sync (the writing tab doesn't know if it succeeded).
 * - BroadcastChannel: fires in ALL tabs including the sender.
 *   Better for real-time sync (the writing tab gets confirmation).
 *   However, it's newer and not supported in very old browsers.
 *
 * HOW TO VERIFY
 * 1. Open Blackout in two tabs.
 * 2. Change a setting in Tab A → should reflect in Tab B immediately.
 * 3. Log out in Tab A → Tab B should redirect to login.
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
