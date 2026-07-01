/**
 * Coliseum Matches — the structured, clocked, gladiatorial format.
 *
 * A Match pairs two fighters around a proposition (a `ColiseumTopic`, reused for
 * the proposition text, domain, and news anchor). Arguments advance in
 * structured video Rounds rather than free reply threads, the crowd votes each
 * round, and when the match clock expires the Crucible opens (see `crucible.ts`)
 * and a permanent Brief is minted (see `brief.ts`).
 *
 * Like `status.ts`, the match status is *derived on read* from a timeline so the
 * synchronous store needs no scheduler: a match becomes `live` once accepted,
 * `crucible` once the clock expires, and `verdict`/`archived` after that.
 */

import type { PositionSnapshot } from './brief';
import type { ColiseumArgumentMedia, ColiseumCitation } from './citations';
import type { ColiseumTopicCategoryKey } from './taxonomy';

/**
 * The match format. Only `callout` is implemented in Phase 1; the union is left
 * open so the remaining spec formats can be added without a breaking change.
 */
export type ColiseumMatchType =
    | 'callout'
    | 'debate'
    | 'pitch'
    | 'prediction'
    | 'gauntlet'
    | 'townsquare'
    | 'tribunal'
    | 'study';

export const COLISEUM_MATCH_TYPES: readonly ColiseumMatchType[] = [
    'callout',
    'debate',
    'pitch',
    'prediction',
    'gauntlet',
    'townsquare',
    'tribunal',
    'study',
] as const;

export function isColiseumMatchType(value: unknown): value is ColiseumMatchType {
    return typeof value === 'string' && (COLISEUM_MATCH_TYPES as readonly string[]).includes(value);
}

export type ColiseumMatchStatus =
    | 'pending'
    | 'accepted'
    | 'live'
    | 'crucible'
    | 'verdict'
    | 'archived';

/** The two corners of a match. */
export type ColiseumSide = 'red' | 'blue';

/** Round vote choice cast by spectators. */
export type ColiseumRoundChoice = 'red' | 'blue' | 'draw';

/** The kind of a round; `steelman` is the spec's mandatory summarize-first round. */
export type ColiseumRoundKind = 'opening' | 'steelman' | 'rebuttal' | 'closing';

export const COLISEUM_ROUND_KINDS: readonly ColiseumRoundKind[] = [
    'opening',
    'steelman',
    'rebuttal',
    'closing',
] as const;

/** Hard cap on a round video — the spec's 3-minute limit, in milliseconds. */
export const MAX_ROUND_DURATION_MS = 3 * 60 * 1000;

/** Default per-round response window before silence is scored as a forfeit. */
export const DEFAULT_ROUND_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ColiseumMatchTimeline {
    createdAt: string;
    /** Set when the opponent accepts; the match goes `live`. */
    acceptedAt?: string;
    /** When the match clock expires and the Crucible opens. */
    clockEndsAt?: string;
    /** When the Crucible closes and the Verdict can be minted. */
    crucibleEndsAt?: string;
    /** When the Verdict was minted (status becomes `verdict`). */
    verdictAt?: string;
    /** When the match was archived (read-only). */
    archivedAt?: string;
}

export interface ColiseumMatch {
    id: string;
    type: ColiseumMatchType;
    /** The proposition as stated — the thing being fought over. */
    proposition: string;
    /**
     * Optional link to a `ColiseumTopic` when the proposition is anchored to a
     * news topic (Debate/Study formats). A bare Callout carries only `proposition`.
     */
    propositionTopicId?: string;
    /** Subject domain (a Coliseum category key) — duplicated for cheap filtering. */
    domain?: ColiseumTopicCategoryKey;
    /** Red corner — the challenger who issued the Callout. */
    challengerId: string;
    /** Blue corner — the opponent; absent until accepted (or for Open challenges). */
    opponentId?: string;
    /** The Matrix room backing this match's Den. */
    denRoomId?: string;
    /** When this match graduated from a Shout, the originating shout id. */
    shoutId?: string;
    status: ColiseumMatchStatus;
    createdAt: string;
    acceptedAt?: string;
    clockEndsAt?: string;
    crucibleEndsAt?: string;
    verdictAt?: string;
    archivedAt?: string;
    /** Per-round response window in ms; silence past this is a forfeit. */
    roundWindowMs: number;
    /** Opaque token for the shareable Challenge Link. */
    challengeToken?: string;
    /** When the Challenge Link was first opened by a recipient (the dodge ping). */
    challengeSeenAt?: string;
    /** When the opponent explicitly declined. */
    declinedAt?: string;
    /** Open Challenge: no specific opponent target, any taker may accept. */
    open?: boolean;
    /**
     * The crowd's position snapshot captured the first time a spectator places
     * themselves on the map. Compared against the end-of-match snapshot to
     * compute the Brief's Shift Score.
     */
    positionStart?: PositionSnapshot;
}

export interface ColiseumRound {
    id: string;
    matchId: string;
    /** 0-based round number. */
    index: number;
    side: ColiseumSide;
    authorId: string;
    kind: ColiseumRoundKind;
    body?: string;
    media?: ColiseumArgumentMedia;
    citations: ColiseumCitation[];
    createdAt: string;
}

export interface ColiseumRoundVote {
    matchId: string;
    roundIndex: number;
    voterId: string;
    choice: ColiseumRoundChoice;
    createdAt: string;
}

/** Which side a fighter occupies, for tally-hiding and authorization checks. */
export function sideForFighter(match: ColiseumMatch, userId: string): ColiseumSide | null {
    if (match.challengerId === userId) return 'red';
    if (match.opponentId === userId) return 'blue';
    return null;
}

export function isFighter(match: ColiseumMatch, userId: string): boolean {
    return sideForFighter(match, userId) !== null;
}

function parseMs(value: string | undefined): number | null {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
}

/**
 * Derive the match status from its timeline. Mirrors `deriveColiseumTopicStatus`:
 * pure, monotonic, and computed on read so no background job is needed.
 *
 * pending → accepted/live → crucible → verdict → archived
 */
export function deriveColiseumMatchStatus(
    timeline: ColiseumMatchTimeline,
    nowEpochMs: number = Date.now()
): ColiseumMatchStatus {
    const archivedAt = parseMs(timeline.archivedAt);
    const verdictAt = parseMs(timeline.verdictAt);
    const crucibleEndsAt = parseMs(timeline.crucibleEndsAt);
    const clockEndsAt = parseMs(timeline.clockEndsAt);
    const acceptedAt = parseMs(timeline.acceptedAt);

    if (archivedAt !== null && nowEpochMs >= archivedAt) return 'archived';
    if (verdictAt !== null && nowEpochMs >= verdictAt) return 'verdict';
    // Crucible window: clock has expired but the verdict has not been minted yet.
    if (clockEndsAt !== null && nowEpochMs >= clockEndsAt) {
        if (crucibleEndsAt !== null && nowEpochMs >= crucibleEndsAt) {
            // Crucible elapsed without an explicit verdict mint — still awaiting it.
            return 'crucible';
        }
        return 'crucible';
    }
    if (acceptedAt !== null && nowEpochMs >= acceptedAt) return 'live';
    return 'pending';
}

export interface RoundTally {
    red: number;
    blue: number;
    draw: number;
    /** The leading side, or 'draw' on a tie / no votes. */
    leader: ColiseumRoundChoice;
}

/**
 * Tally spectator votes for a single round. The caller (the route) decides
 * whether to expose this — fighters argue blind, so tallies are withheld from
 * them until the match ends.
 */
export function tallyRoundVotes(votes: ReadonlyArray<ColiseumRoundVote>): RoundTally {
    let red = 0;
    let blue = 0;
    let draw = 0;
    for (const vote of votes) {
        if (vote.choice === 'red') red += 1;
        else if (vote.choice === 'blue') blue += 1;
        else draw += 1;
    }
    let leader: ColiseumRoundChoice = 'draw';
    if (red > blue && red >= draw) leader = 'red';
    else if (blue > red && blue >= draw) leader = 'blue';
    return { red, blue, draw, leader };
}

/**
 * Whether a round response is overdue. Silence past the window is scored as a
 * concede for that round ("Silence Is a Forfeit"). `lastRoundAt` is the time the
 * previous round was posted; `now` minus that, compared to the window.
 */
export function isForfeit(lastRoundAtIso: string, windowMs: number, nowEpochMs: number): boolean {
    const last = parseMs(lastRoundAtIso);
    if (last === null) return false;
    return nowEpochMs - last > windowMs;
}

/** The ISO deadline by which the next round must be posted. */
export function nextRoundDeadline(lastRoundAtIso: string, windowMs: number): string | null {
    const last = parseMs(lastRoundAtIso);
    if (last === null) return null;
    return new Date(last + windowMs).toISOString();
}

/**
 * Validate that a round's media respects the 3-minute cap. Returns true when
 * there is no media (text-only is allowed) or the duration is within the cap.
 */
export function isWithinRoundDurationCap(media: ColiseumArgumentMedia | undefined): boolean {
    if (!media || media.durationMs === undefined) return true;
    return media.durationMs <= MAX_ROUND_DURATION_MS;
}
