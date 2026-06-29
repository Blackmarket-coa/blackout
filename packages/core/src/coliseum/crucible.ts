/**
 * The Crucible — the crowd-powered closing phase of a Match.
 *
 * When the match clock expires the arena locks for new rounds and the Crucible
 * opens for a fixed window. Each fighter submits one final statement, then the
 * crowd answers a fixed set of structured multiple-choice synthesis questions.
 * The verdict is a straight tally of those answers. There is NO AI at any stage
 * — this module is pure tallying over crowd input.
 */

import type { ColiseumSide } from './match';

/** Default Crucible duration — the spec's 30-minute window, in milliseconds. */
export const CRUCIBLE_DURATION_MS = 30 * 60 * 1000;

/** Character cap on a text final statement. */
export const FINAL_STATEMENT_MAX_CHARS = 500;

/** A spectator's answer to a synthesis question. */
export type CrucibleChoice = 'red' | 'blue' | 'neither' | 'both';

export const CRUCIBLE_CHOICES: readonly CrucibleChoice[] = [
    'red',
    'blue',
    'neither',
    'both',
] as const;

export interface CrucibleQuestion {
    id: string;
    prompt: string;
}

/** The fixed synthesis questions, in display order. */
export const CRUCIBLE_QUESTIONS: readonly CrucibleQuestion[] = [
    { id: 'opening', prompt: 'Who made the stronger opening argument?' },
    { id: 'evidence', prompt: 'Who used evidence more effectively?' },
    { id: 'pressure', prompt: 'Who responded better under pressure?' },
    { id: 'changed_mind', prompt: 'Did anyone actually change your mind on anything?' },
    { id: 'decisive', prompt: 'Who landed the decisive blow?' },
] as const;

const CRUCIBLE_QUESTION_IDS: ReadonlySet<string> = new Set(CRUCIBLE_QUESTIONS.map((q) => q.id));

export function isCrucibleQuestionId(value: unknown): value is string {
    return typeof value === 'string' && CRUCIBLE_QUESTION_IDS.has(value);
}

export function isCrucibleChoice(value: unknown): value is CrucibleChoice {
    return typeof value === 'string' && (CRUCIBLE_CHOICES as readonly string[]).includes(value);
}

export interface CrucibleFinalStatement {
    matchId: string;
    side: ColiseumSide;
    authorId: string;
    /** Optional short-form closing video. */
    mediaMxc?: string;
    /** Text closing, capped at FINAL_STATEMENT_MAX_CHARS. */
    body?: string;
    createdAt: string;
}

export interface CrucibleSynthesisVote {
    matchId: string;
    questionId: string;
    voterId: string;
    choice: CrucibleChoice;
    createdAt: string;
}

export interface CrucibleQuestionBreakdown {
    questionId: string;
    prompt: string;
    red: number;
    blue: number;
    neither: number;
    both: number;
    /** The winning choice for this question, or 'neither' on a tie. */
    winner: CrucibleChoice;
}

export interface CrucibleVerdict {
    matchId: string;
    /** Overall winner derived from the per-question breakdown, or null on a tie. */
    winner: ColiseumSide | null;
    breakdown: CrucibleQuestionBreakdown[];
    /** Per-side score = number of questions that side won outright. */
    redScore: number;
    blueScore: number;
    computedAt: string;
    model: 'coliseum_crucible_v1';
}

function winningChoice(counts: Record<CrucibleChoice, number>): CrucibleChoice {
    let best: CrucibleChoice = 'neither';
    let bestCount = -1;
    let tie = false;
    for (const choice of CRUCIBLE_CHOICES) {
        const count = counts[choice];
        if (count > bestCount) {
            bestCount = count;
            best = choice;
            tie = false;
        } else if (count === bestCount) {
            tie = true;
        }
    }
    return tie || bestCount <= 0 ? 'neither' : best;
}

/**
 * Compose the crowd's synthesis votes into a verdict. Each question is tallied
 * independently; a side's score is how many questions it won outright. The
 * overall winner is the side with the higher score, or null on a tie.
 */
export function deriveCrucibleVerdict(input: {
    matchId: string;
    synthesisVotes: ReadonlyArray<CrucibleSynthesisVote>;
    nowMs?: number;
}): CrucibleVerdict {
    const computedAt = new Date(input.nowMs ?? Date.now()).toISOString();

    const byQuestion = new Map<string, Record<CrucibleChoice, number>>();
    for (const question of CRUCIBLE_QUESTIONS) {
        byQuestion.set(question.id, { red: 0, blue: 0, neither: 0, both: 0 });
    }
    for (const vote of input.synthesisVotes) {
        const counts = byQuestion.get(vote.questionId);
        if (!counts || !isCrucibleChoice(vote.choice)) continue;
        counts[vote.choice] += 1;
    }

    let redScore = 0;
    let blueScore = 0;
    const breakdown: CrucibleQuestionBreakdown[] = CRUCIBLE_QUESTIONS.map((question) => {
        const counts = byQuestion.get(question.id)!;
        const winner = winningChoice(counts);
        if (winner === 'red') redScore += 1;
        else if (winner === 'blue') blueScore += 1;
        return {
            questionId: question.id,
            prompt: question.prompt,
            red: counts.red,
            blue: counts.blue,
            neither: counts.neither,
            both: counts.both,
            winner,
        };
    });

    let winner: ColiseumSide | null = null;
    if (redScore > blueScore) winner = 'red';
    else if (blueScore > redScore) winner = 'blue';

    return {
        matchId: input.matchId,
        winner,
        breakdown,
        redScore,
        blueScore,
        computedAt,
        model: 'coliseum_crucible_v1',
    };
}
