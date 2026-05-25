import {
    aggregateReputation,
    type ReputationEventType,
    type ReputationProfile,
    type ReputationSubject,
} from '@blackout/core';

interface StoredReputationEvent {
    userId: string;
    type: ReputationEventType;
    subject?: ReputationSubject;
    points?: number;
    createdAt: string;
}

const events: StoredReputationEvent[] = [];
/** Dedupe keys keep idempotent awards (e.g. one endorsement per voter+argument). */
const seenDedupeKeys = new Set<string>();

export interface RecordReputationEventInput {
    userId: string;
    type: ReputationEventType;
    subject?: ReputationSubject;
    points?: number;
    /** When set, a repeated key is ignored so the award is granted at most once. */
    dedupeKey?: string;
}

/** Returns true if the event was recorded, false if deduped away. */
export function recordReputationEvent(input: RecordReputationEventInput): boolean {
    if (input.dedupeKey) {
        if (seenDedupeKeys.has(input.dedupeKey)) return false;
        seenDedupeKeys.add(input.dedupeKey);
    }
    events.push({
        userId: input.userId,
        type: input.type,
        subject: input.subject,
        points: input.points,
        createdAt: new Date().toISOString(),
    });
    return true;
}

export function getUserReputation(userId: string): ReputationProfile {
    return aggregateReputation(events.filter((event) => event.userId === userId));
}

/** Test hook: clear all recorded reputation. */
export function resetReputationStore(): void {
    events.length = 0;
    seenDedupeKeys.clear();
}
