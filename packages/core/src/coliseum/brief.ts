/**
 * The Coliseum Brief — the permanent, immutable public record minted when a
 * match's Verdict drops. A Brief is the fighter's actual debate record: the
 * proposition, each side's claims, the crowd's verdict breakdown, and how much
 * the crowd moved (the Shift Score). Once minted it is never rewritten.
 */

import type { CrucibleQuestionBreakdown, CrucibleVerdict } from './crucible';
import type { ColiseumSide } from './match';

/**
 * A snapshot of the crowd's collective position on the proposition. A coarse
 * 2-axis summary (agree share × certainty) — the full live Position Map is a
 * later phase, but the Brief records its start and end state for the Shift Score.
 */
export interface PositionSnapshot {
    /** Share of the crowd agreeing with the proposition, 0..1. */
    agreeShare: number;
    /** Mean confidence of the crowd, 0..1. */
    certainty: number;
    /** Number of spectators whose position fed this snapshot. */
    sampleSize: number;
}

export interface BriefClaim {
    side: ColiseumSide;
    /** The claim text (from a round body or summary). */
    text: string;
    /** Evidence ruling if the claim was staked: 'holds' | 'stretches' | 'falls'. */
    evidenceRuling?: 'holds' | 'stretches' | 'falls';
}

export interface BriefUpheldFlag {
    roundIndex: number;
    /** Flag type upheld by the crowd. */
    flagType: string;
    against: ColiseumSide;
}

export interface ColiseumBrief {
    id: string;
    matchId: string;
    /** The proposition as stated (mirrors the proposition topic title). */
    proposition: string;
    claims: BriefClaim[];
    upheldFlags: BriefUpheldFlag[];
    /** Crowd position when the match opened. */
    positionStart?: PositionSnapshot;
    /** Crowd position when the verdict dropped. */
    positionEnd?: PositionSnapshot;
    /** How much the match moved the crowd, 0..1. */
    shiftScore: number;
    /** Overall winner side, or null on a draw. */
    winner: ColiseumSide | null;
    questionBreakdown: CrucibleQuestionBreakdown[];
    mintedAt: string;
}

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

/**
 * Shift Score: how much the crowd's collective position moved across the match.
 * A blend of the change in agreement share and the change in certainty, both in
 * 0..1, so a match that flips opinions or hardens/softens confidence scores high.
 */
export function computeShiftScore(
    start: PositionSnapshot | undefined,
    end: PositionSnapshot | undefined
): number {
    if (!start || !end) return 0;
    const agreeDelta = Math.abs(end.agreeShare - start.agreeShare);
    const certaintyDelta = Math.abs(end.certainty - start.certainty);
    return clamp01(0.7 * agreeDelta + 0.3 * certaintyDelta);
}

export interface MintBriefInput {
    id: string;
    matchId: string;
    proposition: string;
    verdict: CrucibleVerdict;
    claims?: BriefClaim[];
    upheldFlags?: BriefUpheldFlag[];
    positionStart?: PositionSnapshot;
    positionEnd?: PositionSnapshot;
    mintedAt?: string;
}

/**
 * Assemble the immutable Brief from a finished match. Pure — the caller persists
 * the result and never mutates it afterward.
 */
export function mintBrief(input: MintBriefInput): ColiseumBrief {
    return {
        id: input.id,
        matchId: input.matchId,
        proposition: input.proposition,
        claims: input.claims ?? [],
        upheldFlags: input.upheldFlags ?? [],
        positionStart: input.positionStart,
        positionEnd: input.positionEnd,
        shiftScore: computeShiftScore(input.positionStart, input.positionEnd),
        winner: input.verdict.winner,
        questionBreakdown: input.verdict.breakdown,
        mintedAt: input.mintedAt ?? new Date().toISOString(),
    };
}
