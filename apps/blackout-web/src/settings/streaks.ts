import type { ReputationSnapshot } from "../types";

export interface StreakPolicy {
  enabled: boolean;
  graceDays: number;
}

export interface StreakUpdateInput {
  policy: StreakPolicy;
  snapshot: ReputationSnapshot;
  activityDate: string;
}

function dayStart(value: string): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function applySoftStreakUpdate(input: StreakUpdateInput): ReputationSnapshot {
  const { policy, snapshot, activityDate } = input;
  if (!policy.enabled) return { ...snapshot };

  const last = dayStart(snapshot.lastUpdatedAt);
  const now = dayStart(activityDate);
  const daysSince = Math.max(0, Math.floor((now - last) / 86_400_000));

  if (daysSince === 0) {
    return { ...snapshot, lastUpdatedAt: activityDate };
  }

  if (daysSince === 1) {
    return {
      ...snapshot,
      streakDays: snapshot.streakDays + 1,
      graceDaysRemaining: policy.graceDays,
      lastUpdatedAt: activityDate,
    };
  }

  const gapDays = daysSince - 1;
  if (gapDays <= snapshot.graceDaysRemaining) {
    return {
      ...snapshot,
      streakDays: snapshot.streakDays + 1,
      graceDaysRemaining: Math.max(0, snapshot.graceDaysRemaining - gapDays),
      lastUpdatedAt: activityDate,
    };
  }

  return {
    ...snapshot,
    streakDays: 1,
    graceDaysRemaining: policy.graceDays,
    lastUpdatedAt: activityDate,
  };
}
