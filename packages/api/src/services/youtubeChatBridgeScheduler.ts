import { db } from '../db/store';
import { syncBridge, type BridgeServiceOptions } from './youtubeChatBridge';
import { log } from '../telemetry/logger';

/**
 * Periodic poller that walks every active YouTube chat bridge and pulls
 * new messages via {@link syncBridge}. YouTube's chat API is poll-shaped
 * (no push), so this is the only way to mirror chat into Matrix without
 * requiring the creator to click a button.
 *
 * One tick walks bridges sequentially — same isolation rationale as the
 * Streamlabs scheduler (one user's API failure doesn't cascade) and
 * easier to reason about against YouTube's per-broadcast quota.
 *
 * Single-process by design — multi-replica deployments will need
 * ownership coordination (postgres advisory lock keyed by bridge id),
 * tracked in the multi-platform compat plan.
 */

export const DEFAULT_INTERVAL_MS = 30_000;

/** Fallback backoff when YouTube rate-limits us without a Retry-After header. */
const RATE_LIMIT_BACKOFF_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

/** True while a tick is in flight — prevents overlapping `setInterval` runs. */
let polling = false;

/**
 * Per-bridge "earliest next poll" gate (epoch ms). Set from YouTube's
 * `pollingIntervalMillis` on success and from `retryAfterSeconds` on a
 * rate-limit, so we honor YouTube's pacing instead of hammering a bridge
 * every fixed tick.
 */
const pollGate = new Map<string, number>();

export interface PollResult {
  inspected: number;
  delivered: number;
  errors: number;
  rateLimited: number;
  noActiveBroadcast: number;
  /** Bridges skipped this tick because their poll gate had not yet elapsed. */
  skipped: number;
}

export const runYoutubePoll = async (
  options: BridgeServiceOptions = {},
): Promise<PollResult> => {
  const now = Date.now();
  const bridges = db.listActiveYoutubeChatBridges();
  const result: PollResult = {
    inspected: bridges.length,
    delivered: 0,
    errors: 0,
    rateLimited: 0,
    noActiveBroadcast: 0,
    skipped: 0,
  };
  // Drop gate entries for bridges that are no longer active so the map can't
  // grow unbounded as creators come and go.
  const activeIds = new Set(bridges.map((b) => b.id));
  for (const id of pollGate.keys()) if (!activeIds.has(id)) pollGate.delete(id);

  for (const bridge of bridges) {
    const gatedUntil = pollGate.get(bridge.id);
    if (gatedUntil !== undefined && gatedUntil > now) {
      result.skipped += 1;
      continue;
    }
    try {
      const outcome = await syncBridge(bridge, options);
      switch (outcome.kind) {
        case 'ok':
          result.delivered += outcome.delivered;
          // Respect YouTube's suggested cadence: don't re-poll this bridge
          // until its pollingIntervalMillis has elapsed.
          if (outcome.pollingIntervalMillis && outcome.pollingIntervalMillis > 0) {
            pollGate.set(bridge.id, Date.now() + outcome.pollingIntervalMillis);
          } else {
            pollGate.delete(bridge.id);
          }
          if (outcome.delivered > 0) {
            log.info('youtube_chat_bridge_synced', {
              bridgeId: bridge.id,
              delivered: outcome.delivered,
              messages: outcome.messages,
            });
          }
          break;
        case 'no_active_broadcast':
          result.noActiveBroadcast += 1;
          // Keep polling at the normal cadence so we detect go-live promptly.
          pollGate.delete(bridge.id);
          break;
        case 'rate_limited': {
          result.rateLimited += 1;
          const backoffMs = outcome.retryAfterSeconds
            ? outcome.retryAfterSeconds * 1000
            : RATE_LIMIT_BACKOFF_MS;
          pollGate.set(bridge.id, Date.now() + backoffMs);
          log.warn('youtube_chat_bridge_rate_limited', {
            bridgeId: bridge.id,
            retryAfterSeconds: outcome.retryAfterSeconds,
            backoffMs,
          });
          break;
        }
        case 'no_link':
        case 'token_unavailable':
        case 'failed':
          result.errors += 1;
          log.warn('youtube_chat_bridge_sync_failed', {
            bridgeId: bridge.id,
            kind: outcome.kind,
          });
          break;
        default: {
          const exhaustive: never = outcome;
          void exhaustive;
        }
      }
    } catch (err) {
      result.errors += 1;
      log.warn('youtube_chat_bridge_sync_threw', {
        bridgeId: bridge.id,
        error: String(err),
      });
    }
  }
  return result;
};

export const startYoutubeChatScheduler = (
  intervalMs: number = DEFAULT_INTERVAL_MS,
): { stop: () => void } => {
  if (timer) return { stop: stopYoutubeChatScheduler };
  timer = setInterval(() => {
    // A poll cycle can outlast the tick interval (many bridges, slow upstream).
    // Skip overlapping ticks rather than stacking concurrent polls.
    if (polling) {
      log.warn('youtube_chat_scheduler_tick_skipped', { reason: 'previous_poll_in_flight' });
      return;
    }
    polling = true;
    void runYoutubePoll()
      .catch((err) => {
        log.warn('youtube_chat_scheduler_tick_threw', { error: String(err) });
      })
      .finally(() => {
        polling = false;
      });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: stopYoutubeChatScheduler };
};

/** Test-only: clear the per-bridge poll gate between cases. */
export const __resetPollGateForTests = (): void => {
  pollGate.clear();
};

export const stopYoutubeChatScheduler = (): void => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

export const isYoutubeChatSchedulerRunning = (): boolean => timer !== null;
