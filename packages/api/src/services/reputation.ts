import {
    aggregateReputation,
    pointsForReputationEvent,
    tierFromScore,
    type ReputationEventType,
} from '@blackout/core';

export type { ReputationEventType } from '@blackout/core';

export function calculateReputationTier(score: number) {
    return tierFromScore(score);
}

export function pointsForEvent(eventType: ReputationEventType): number {
    return pointsForReputationEvent(eventType);
}

export { aggregateReputation };
