import type {
  DeadmanSwitchRecord,
  DeadmanSwitchStatus,
} from '../db/types';

/**
 * Pure scheduler logic for deadman switches. Kept free of IO so it can
 * be unit-tested deterministically and reused by an out-of-process cron
 * runner, a webhook trigger, or the in-process API scheduler.
 *
 * The state machine mirrors the protocol envelopes:
 *   armed -> grace -> triggered
 *   armed/grace -> cancelled (terminal)
 *   triggered/cancelled -> (no transitions)
 */

export type DeadmanTransition =
  | { kind: 'none'; record: DeadmanSwitchRecord }
  | { kind: 'grace'; record: DeadmanSwitchRecord }
  | { kind: 'triggered'; record: DeadmanSwitchRecord };

export const MIN_CHECK_IN_INTERVAL_SECONDS = 60;
export const MAX_CHECK_IN_INTERVAL_SECONDS = 60 * 60 * 24 * 365;
export const MIN_GRACE_PERIOD_SECONDS = 0;
export const MAX_GRACE_PERIOD_SECONDS = 60 * 60 * 24 * 30;
export const MAX_RECIPIENTS = 64;

export const computeDeadlines = (input: {
  lastCheckInAt: string;
  checkInIntervalSeconds: number;
  gracePeriodSeconds: number;
}): { triggerAt: string; releaseAt: string } => {
  const base = new Date(input.lastCheckInAt).getTime();
  const triggerAt = new Date(base + input.checkInIntervalSeconds * 1000).toISOString();
  const releaseAt = new Date(
    base + (input.checkInIntervalSeconds + input.gracePeriodSeconds) * 1000
  ).toISOString();
  return { triggerAt, releaseAt };
};

/**
 * Decide which transition (if any) a switch should make at `now`. Pure
 * over `record` and `now`; never mutates input.
 *
 * Rules:
 *   - `cancelled` and `triggered` are terminal; no transition.
 *   - `armed` and now >= triggerAt -> grace (unless grace period is 0,
 *     in which case it skips straight to triggered).
 *   - `grace` and now >= releaseAt -> triggered.
 *   - Otherwise no transition.
 */
export const evaluateTransition = (
  record: DeadmanSwitchRecord,
  now: Date
): DeadmanTransition => {
  if (record.status === 'triggered' || record.status === 'cancelled') {
    return { kind: 'none', record };
  }

  const nowMs = now.getTime();
  const triggerMs = new Date(record.triggerAt).getTime();
  const releaseMs = new Date(record.releaseAt).getTime();

  if (record.status === 'armed') {
    if (nowMs < triggerMs) return { kind: 'none', record };
    if (record.gracePeriodSeconds <= 0 || nowMs >= releaseMs) {
      return {
        kind: 'triggered',
        record: { ...record, status: 'triggered' satisfies DeadmanSwitchStatus },
      };
    }
    return {
      kind: 'grace',
      record: { ...record, status: 'grace' satisfies DeadmanSwitchStatus },
    };
  }

  // status === 'grace'
  if (nowMs < releaseMs) return { kind: 'none', record };
  return {
    kind: 'triggered',
    record: { ...record, status: 'triggered' satisfies DeadmanSwitchStatus },
  };
};

/**
 * Apply a fresh check-in at `now`. Resets the deadlines and returns the
 * switch in `armed` status. Throws if the switch is terminal.
 */
export const applyCheckIn = (
  record: DeadmanSwitchRecord,
  now: Date
): DeadmanSwitchRecord => {
  if (record.status === 'triggered') {
    throw new Error('Cannot check in: switch already triggered');
  }
  if (record.status === 'cancelled') {
    throw new Error('Cannot check in: switch was cancelled');
  }
  const lastCheckInAt = now.toISOString();
  const { triggerAt, releaseAt } = computeDeadlines({
    lastCheckInAt,
    checkInIntervalSeconds: record.checkInIntervalSeconds,
    gracePeriodSeconds: record.gracePeriodSeconds,
  });
  return {
    ...record,
    status: 'armed',
    lastCheckInAt,
    triggerAt,
    releaseAt,
  };
};

export const validateArmInput = (input: {
  checkInIntervalSeconds: number;
  gracePeriodSeconds: number;
  recipients: readonly string[];
  encryptedPayload: string;
}): string | null => {
  if (
    !Number.isFinite(input.checkInIntervalSeconds) ||
    input.checkInIntervalSeconds < MIN_CHECK_IN_INTERVAL_SECONDS ||
    input.checkInIntervalSeconds > MAX_CHECK_IN_INTERVAL_SECONDS
  ) {
    return `checkInIntervalSeconds must be between ${MIN_CHECK_IN_INTERVAL_SECONDS} and ${MAX_CHECK_IN_INTERVAL_SECONDS}`;
  }
  if (
    !Number.isFinite(input.gracePeriodSeconds) ||
    input.gracePeriodSeconds < MIN_GRACE_PERIOD_SECONDS ||
    input.gracePeriodSeconds > MAX_GRACE_PERIOD_SECONDS
  ) {
    return `gracePeriodSeconds must be between ${MIN_GRACE_PERIOD_SECONDS} and ${MAX_GRACE_PERIOD_SECONDS}`;
  }
  if (input.recipients.length === 0) {
    return 'recipients must not be empty';
  }
  if (input.recipients.length > MAX_RECIPIENTS) {
    return `recipients must contain at most ${MAX_RECIPIENTS} entries`;
  }
  if (input.recipients.some((entry) => entry.length === 0)) {
    return 'recipients entries must be non-empty';
  }
  if (input.encryptedPayload.length === 0) {
    return 'encryptedPayload must be non-empty';
  }
  return null;
};
