import { db } from '../db/store';
import {
  syncStreamlabsDonationsForUser,
  type SyncOutcome,
} from './streamlabsDonationSync';
import { log } from '../telemetry/logger';

/**
 * Background scheduler that periodically calls
 * {@link syncStreamlabsDonationsForUser} for every Blackout user with a
 * linked Streamlabs account. Removes the manual "Sync donations now"
 * step so a creator's overlay fires within minutes of a real donation
 * landing on Streamlabs.
 *
 * Single-process by design — multi-replica deployments will need to
 * coordinate ownership (postgres advisory lock keyed by Blackout user
 * id, etc.). For Phase 1's single-replica deploys this is fine.
 *
 * Sequential execution per tick (one user at a time) so a transient
 * Streamlabs slowdown can't cascade into a thundering herd of overlapping
 * requests. Each user's sync is isolated — one failing user does NOT
 * stop the others.
 */

export const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let timer: ReturnType<typeof setInterval> | null = null;

export interface PollResult {
  /** Total linked Streamlabs accounts inspected this tick. */
  inspected: number;
  /** Sum of `newDonations` returned by the per-user sync. */
  newDonations: number;
  /** Per-user `delivered` counts summed. */
  delivered: number;
  /** How many users surfaced an error (token_unavailable, failed, etc.). */
  errors: number;
  /** How many users were rate-limited by Streamlabs. */
  rateLimited: number;
}

export interface RunPollOptions {
  /** Pluggable fetch passed through to the underlying sync calls (tests). */
  fetch?: typeof fetch;
}

/**
 * Walk every linked Streamlabs account and run a donation sync against it.
 * Returns aggregate counts; per-user outcomes go to the structured log.
 */
export const runStreamlabsPoll = async (
  options: RunPollOptions = {},
): Promise<PollResult> => {
  const accounts = db.listAllLinkedAccountsForProvider('streamlabs');
  const result: PollResult = {
    inspected: accounts.length,
    newDonations: 0,
    delivered: 0,
    errors: 0,
    rateLimited: 0,
  };
  for (const account of accounts) {
    let outcome: SyncOutcome;
    try {
      outcome = await syncStreamlabsDonationsForUser(account.blackoutUserId, {
        fetch: options.fetch,
      });
    } catch (err) {
      result.errors += 1;
      log.warn('streamlabs_scheduler_user_threw', {
        blackoutUserId: account.blackoutUserId,
        error: String(err),
      });
      continue;
    }
    switch (outcome.kind) {
      case 'ok':
        result.newDonations += outcome.newDonations;
        result.delivered += outcome.delivered;
        if (outcome.newDonations > 0) {
          log.info('streamlabs_scheduler_user_synced', {
            blackoutUserId: account.blackoutUserId,
            newDonations: outcome.newDonations,
            delivered: outcome.delivered,
          });
        }
        break;
      case 'rate_limited':
        result.rateLimited += 1;
        log.warn('streamlabs_scheduler_user_rate_limited', {
          blackoutUserId: account.blackoutUserId,
          retryAfterSeconds: outcome.retryAfterSeconds,
        });
        break;
      case 'no_link':
        // Account was unlinked between listAll and the sync call. No-op.
        break;
      case 'token_unavailable':
      case 'failed':
        result.errors += 1;
        log.warn('streamlabs_scheduler_user_failed', {
          blackoutUserId: account.blackoutUserId,
          kind: outcome.kind,
        });
        break;
      default: {
        const exhaustive: never = outcome;
        void exhaustive;
      }
    }
  }
  return result;
};

/**
 * Start the periodic scheduler. Idempotent — subsequent calls return the
 * same stop handle. The interval timer is `.unref()`'d so it doesn't
 * keep the Node process alive on its own.
 */
export const startStreamlabsScheduler = (
  intervalMs: number = DEFAULT_INTERVAL_MS,
): { stop: () => void } => {
  if (timer) return { stop: stopStreamlabsScheduler };
  timer = setInterval(() => {
    void runStreamlabsPoll().catch((err) => {
      log.warn('streamlabs_scheduler_tick_threw', { error: String(err) });
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: stopStreamlabsScheduler };
};

export const stopStreamlabsScheduler = (): void => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

export const isStreamlabsSchedulerRunning = (): boolean => timer !== null;
