import { randomUUID } from 'node:crypto';
import {
    aggregateReputation,
    type ReputationEventType,
    type ReputationProfile,
    type ReputationSubject,
} from '@blackout/core';
import { db } from '../db/store';

export interface RecordReputationEventInput {
    userId: string;
    type: ReputationEventType;
    subject?: ReputationSubject;
    points?: number;
    /** When set, a repeated key is ignored so the award is granted at most once. */
    dedupeKey?: string;
}

/**
 * Returns true if the event was recorded, false if deduped away. Events persist
 * in the shared store, so per-subject reputation — and the dedupe set, derived
 * from the stored events' dedupe keys — survive a restart.
 */
export function recordReputationEvent(input: RecordReputationEventInput): boolean {
    if (input.dedupeKey && db.reputationDedupeKeyExists(input.dedupeKey)) return false;
    db.addReputationEvent({
        id: randomUUID(),
        userId: input.userId,
        type: input.type,
        subject: input.subject,
        points: input.points,
        dedupeKey: input.dedupeKey,
        createdAt: new Date().toISOString(),
    });
    return true;
}

export function getUserReputation(userId: string): ReputationProfile {
    return aggregateReputation(db.listReputationEvents().filter((event) => event.userId === userId));
}

/** Test hook: clear all recorded reputation. */
export function resetReputationStore(): void {
    db.resetReputationEvents();
}
