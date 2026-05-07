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

let timer: ReturnType<typeof setInterval> | null = null;

export interface PollResult {
  inspected: number;
  delivered: number;
  errors: number;
  rateLimited: number;
  noActiveBroadcast: number;
}

export const runYoutubePoll = async (
  options: BridgeServiceOptions = {},
): Promise<PollResult> => {
  const bridges = db.listActiveYoutubeChatBridges();
  const result: PollResult = {
    inspected: bridges.length,
    delivered: 0,
    errors: 0,
    rateLimited: 0,
    noActiveBroadcast: 0,
  };
  for (const bridge of bridges) {
    try {
      const outcome = await syncBridge(bridge, options);
      switch (outcome.kind) {
        case 'ok':
          result.delivered += outcome.delivered;
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
          break;
        case 'rate_limited':
          result.rateLimited += 1;
          log.warn('youtube_chat_bridge_rate_limited', {
            bridgeId: bridge.id,
            retryAfterSeconds: outcome.retryAfterSeconds,
          });
          break;
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
    void runYoutubePoll().catch((err) => {
      log.warn('youtube_chat_scheduler_tick_threw', { error: String(err) });
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: stopYoutubeChatScheduler };
};

export const stopYoutubeChatScheduler = (): void => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

export const isYoutubeChatSchedulerRunning = (): boolean => timer !== null;
