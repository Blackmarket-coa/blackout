import type { ReputationTier } from '../types';

export const REPUTATION_THRESHOLDS: Record<ReputationTier, number> = {
  member: 0,
  vendor: 100,
  coordinator: 500,
  arbiter: 1000,
};

export function tierFromScore(score: number): ReputationTier {
  if (score >= REPUTATION_THRESHOLDS.arbiter) return 'arbiter';
  if (score >= REPUTATION_THRESHOLDS.coordinator) return 'coordinator';
  if (score >= REPUTATION_THRESHOLDS.vendor) return 'vendor';
  return 'member';
}

export function tallyVotes(entries: Array<{ choice: string }>) {
  const total = entries.length;
  const byChoice = entries.reduce<Record<string, number>>((acc, next) => {
    acc[next.choice] = (acc[next.choice] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(byChoice).map(([choice, votes]) => ({
    choice,
    votes,
    percentage: total === 0 ? 0 : Math.round((votes / total) * 100),
  }));
}
