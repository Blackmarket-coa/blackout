import { randomUUID } from 'node:crypto';
import {
    aggregateReputation,
    tallyArenaRecord,
    type ArenaRecord,
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
    /**
     * Who/what caused the award (W4 source attribution): a user id (the
     * endorsing voter) or a system actor slug (`coliseum:verdict`). Before
     * this field, the acting party survived only inside dedupe-key strings.
     */
    actor?: string;
    /** Free-form audit payload (match id, round index, argument id, …). */
    detail?: Record<string, unknown>;
}

/**
 * Returns true if the event was recorded, false if deduped away. Events persist
 * in the shared store, so per-subject reputation — and the dedupe set, derived
 * from the stored events' dedupe keys — survive a restart.
 *
 * This is the log's ONE write path (append-only, enforced in the store;
 * transfer-prohibited — no API reassigns reputation between users).
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
        actor: input.actor,
        detail: input.detail,
        createdAt: new Date().toISOString(),
    });
    return true;
}

export function getUserReputation(userId: string): ReputationProfile {
    return aggregateReputation(db.listReputationEventsForUser(userId));
}

/** The user's literal Coliseum record — event counts, not points. */
export function getUserArenaRecord(userId: string): ArenaRecord {
    return tallyArenaRecord(db.listReputationEventsForUser(userId));
}

/** Test hook: clear all recorded reputation. */
export function resetReputationStore(): void {
    db.resetReputationEvents();
}
