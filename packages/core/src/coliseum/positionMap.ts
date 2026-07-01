/**
 * The Live Position Map — the crowd's collective stance on the proposition,
 * tracked on two axes: agreement (agree/disagree) and confidence (certain/
 * uncertain). Spectators place themselves; the aggregate moves in real time as
 * arguments land. The start-vs-end movement is the match's Shift Score.
 */

import type { PositionSnapshot } from './brief';

/** A single spectator's placement on the position map. */
export interface ColiseumPositionVote {
    matchId: string;
    voterId: string;
    /** true = agrees with the proposition. */
    agree: boolean;
    /** true = confident in their stance. */
    certain: boolean;
    createdAt: string;
}

/** Axis labels for the map UI. */
export const POSITION_AXES = {
    agreement: { positive: 'Agree', negative: 'Disagree' },
    confidence: { positive: 'Certain', negative: 'Uncertain' },
} as const;

/**
 * Fold the crowd's placements into a snapshot: the share agreeing and the share
 * certain, plus the sample size. One vote per voter is assumed (the store keys
 * votes by `(match, voter)`), so this is a straight mean over the latest votes.
 */
export function aggregatePosition(votes: ReadonlyArray<ColiseumPositionVote>): PositionSnapshot {
    const sampleSize = votes.length;
    if (sampleSize === 0) {
        return { agreeShare: 0, certainty: 0, sampleSize: 0 };
    }
    let agree = 0;
    let certain = 0;
    for (const vote of votes) {
        if (vote.agree) agree += 1;
        if (vote.certain) certain += 1;
    }
    return {
        agreeShare: agree / sampleSize,
        certainty: certain / sampleSize,
        sampleSize,
    };
}
