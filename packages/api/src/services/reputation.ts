import { tierFromScore } from '@blackout/core';

export type ReputationEventType =
  | 'vote_cast'
  | 'proposal_passed'
  | 'dispute_won'
  | 'vendor_transaction';

export function calculateReputationTier(score: number) {
  return tierFromScore(score);
}

export function pointsForEvent(eventType: ReputationEventType): number {
  switch (eventType) {
    case 'vote_cast':
      return 1;
    case 'proposal_passed':
      return 10;
    case 'vendor_transaction':
      return 5;
    case 'dispute_won':
      return 7;
  }
}
