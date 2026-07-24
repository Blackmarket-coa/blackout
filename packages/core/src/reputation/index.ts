import { tierFromScore } from '../governance';
import type { ReputationTier } from '../types';
import { COLISEUM_TOPIC_CATEGORY_KEYS, type ColiseumTopicCategoryKey } from '../coliseum/taxonomy';

/**
 * Reputation is earned per subject area, not as a single global number. The
 * subject taxonomy reuses the Coliseum topic categories so a contribution in a
 * debate maps directly to a subject standing.
 */
export type ReputationSubject = ColiseumTopicCategoryKey;
export const REPUTATION_SUBJECTS: readonly ReputationSubject[] = COLISEUM_TOPIC_CATEGORY_KEYS;

export type ReputationEventType =
    | 'vote_cast'
    | 'argument_endorsed'
    | 'proposal_passed'
    | 'dispute_won'
    | 'vendor_transaction'
    // Coliseum fighter events — credited per subject (domain) so a fighter's
    // win/loss record builds up per domain alongside the overall standing.
    | 'match_won'
    | 'match_drawn'
    | 'round_won'
    | 'steelman_passed'
    | 'credibility_strike';

export const REPUTATION_EVENT_POINTS: Record<ReputationEventType, number> = {
    vote_cast: 1,
    argument_endorsed: 2,
    proposal_passed: 10,
    dispute_won: 7,
    vendor_transaction: 5,
    match_won: 12,
    match_drawn: 4,
    round_won: 2,
    steelman_passed: 3,
    credibility_strike: -5,
};

export function pointsForReputationEvent(type: ReputationEventType): number {
    return REPUTATION_EVENT_POINTS[type];
}

export interface ReputationEventInput {
    type: ReputationEventType;
    /** Subject area this event contributes to; omit for subject-agnostic events. */
    subject?: ReputationSubject;
    /** Optional point override; defaults to the type's standard weight. */
    points?: number;
}

export interface ReputationStanding {
    score: number;
    tier: ReputationTier;
}

export interface ReputationProfile {
    overall: ReputationStanding;
    bySubject: Partial<Record<ReputationSubject, ReputationStanding>>;
}

/**
 * A fighter's literal arena record — raw event counts, not points. This is the
 * "debates won" status layer surfaced on profiles alongside the scored
 * standings.
 */
export interface ArenaRecord {
    matchesWon: number;
    matchesDrawn: number;
    roundsWon: number;
    steelmansPassed: number;
    credibilityStrikes: number;
}

/** Count the Coliseum fighter events in a user's reputation history. */
export function tallyArenaRecord(
    events: ReadonlyArray<{ type: ReputationEventType }>
): ArenaRecord {
    const record: ArenaRecord = {
        matchesWon: 0,
        matchesDrawn: 0,
        roundsWon: 0,
        steelmansPassed: 0,
        credibilityStrikes: 0,
    };
    for (const event of events) {
        if (event.type === 'match_won') record.matchesWon += 1;
        else if (event.type === 'match_drawn') record.matchesDrawn += 1;
        else if (event.type === 'round_won') record.roundsWon += 1;
        else if (event.type === 'steelman_passed') record.steelmansPassed += 1;
        else if (event.type === 'credibility_strike') record.credibilityStrikes += 1;
    }
    return record;
}

/**
 * Fold a list of reputation events into an overall standing plus a per-subject
 * breakdown. Tiers are derived with the shared `tierFromScore` thresholds so
 * subject and overall standings use the same ladder.
 */
export function aggregateReputation(events: readonly ReputationEventInput[]): ReputationProfile {
    let overallScore = 0;
    const subjectScores = new Map<ReputationSubject, number>();

    for (const event of events) {
        const points = event.points ?? pointsForReputationEvent(event.type);
        overallScore += points;
        if (event.subject) {
            subjectScores.set(event.subject, (subjectScores.get(event.subject) ?? 0) + points);
        }
    }

    const bySubject: Partial<Record<ReputationSubject, ReputationStanding>> = {};
    for (const [subject, score] of subjectScores) {
        bySubject[subject] = { score, tier: tierFromScore(score) };
    }

    return {
        overall: { score: overallScore, tier: tierFromScore(overallScore) },
        bySubject,
    };
}
