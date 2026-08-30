import {
    deriveColiseumMatchStatus,
    deriveCredibilityStrike,
    deriveCrucibleVerdict,
    deriveChallengeStatus,
    isWithinRoundDurationCap,
    mintBrief,
    sideForFighter,
    tallyRoundVotes,
    CRUCIBLE_DURATION_MS,
    type ColiseumBrief,
    type ColiseumMatch,
    type ColiseumMatchType,
    type ColiseumRound,
    type ColiseumRoundChoice,
    type ColiseumRoundKind,
    type ColiseumRoundVote,
    type ColiseumSide,
    type ColiseumChallengeStatus,
    type ColiseumTopicCategoryKey,
    type CrucibleChoice,
    type CrucibleVerdict,
    type RoundTally,
} from '@blackout/core';
import type { ColiseumArgumentMedia, ColiseumCitation } from '@blackout/core';
import { db } from '../db/store';
import { recordReputationEvent } from './reputationStore';

const DEFAULT_ROUND_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Default total match clock from acceptance to Crucible — 7 days. */
const DEFAULT_MATCH_CLOCK_MS = 7 * 24 * 60 * 60 * 1000;

function rand(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function newMatchId(): string {
    return rand('match');
}
export function newRoundId(): string {
    return rand('round');
}
export function newBriefId(): string {
    return rand('brief');
}
export function newChallengeToken(): string {
    return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** Refresh the derived status against `now` so list/read filters stay correct. */
function refreshStatus(match: ColiseumMatch, nowMs: number): ColiseumMatch {
    const status = deriveColiseumMatchStatus(match, nowMs);
    if (status === match.status) return match;
    const next = { ...match, status };
    db.upsertColiseumMatch(next);
    return next;
}

/** ISO time the user's most recent match finished (verdict/archived), or undefined. */
export function lastMatchEndedAt(userId: string): string | undefined {
    let latest: string | undefined;
    for (const match of db.listColiseumMatches()) {
        if (match.challengerId !== userId && match.opponentId !== userId) continue;
        const ended = match.verdictAt ?? match.archivedAt;
        if (ended && (!latest || ended > latest)) latest = ended;
    }
    return latest;
}

export interface CreateMatchInput {
    type?: ColiseumMatchType;
    proposition: string;
    propositionTopicId?: string;
    domain?: ColiseumTopicCategoryKey;
    challengerId: string;
    opponentId?: string;
    denRoomId?: string;
    shoutId?: string;
    open?: boolean;
    roundWindowMs?: number;
}

export function createMatch(input: CreateMatchInput, nowMs: number = Date.now()): ColiseumMatch {
    const nowIso = new Date(nowMs).toISOString();
    const match: ColiseumMatch = {
        id: newMatchId(),
        type: input.type ?? 'callout',
        proposition: input.proposition,
        propositionTopicId: input.propositionTopicId,
        domain: input.domain,
        challengerId: input.challengerId,
        opponentId: input.open ? undefined : input.opponentId,
        denRoomId: input.denRoomId,
        shoutId: input.shoutId,
        status: 'pending',
        createdAt: nowIso,
        roundWindowMs: input.roundWindowMs ?? DEFAULT_ROUND_WINDOW_MS,
        challengeToken: newChallengeToken(),
        open: input.open ?? false,
    };
    db.upsertColiseumMatch(match);
    return match;
}

export function getMatch(id: string, nowMs: number = Date.now()): ColiseumMatch | null {
    const match = db.getColiseumMatch(id);
    if (!match) return null;
    return refreshStatus(match, nowMs);
}

export interface MatchFilter {
    domain?: ColiseumTopicCategoryKey;
    status?: ColiseumMatch['status'];
    fighterId?: string;
    /**
     * Matches fought over a given topic. `propositionTopicId` has been stored
     * since matches shipped but nothing ever read it back — this is what makes
     * a topic able to show the fights it produced.
     */
    propositionTopicId?: string;
}

export function listMatches(filter: MatchFilter = {}, nowMs: number = Date.now()): ColiseumMatch[] {
    return db
        .listColiseumMatches()
        .map((m) => refreshStatus(m, nowMs))
        .filter((m) => {
            if (filter.domain && m.domain !== filter.domain) return false;
            if (filter.status && m.status !== filter.status) return false;
            if (filter.propositionTopicId && m.propositionTopicId !== filter.propositionTopicId) {
                return false;
            }
            if (
                filter.fighterId &&
                m.challengerId !== filter.fighterId &&
                m.opponentId !== filter.fighterId
            ) {
                return false;
            }
            return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Accept a pending challenge. Returns the live match, or a reason string. */
export function acceptMatch(
    matchId: string,
    userId: string,
    nowMs: number = Date.now()
): ColiseumMatch | 'not_found' | 'forbidden' | 'not_pending' {
    const match = db.getColiseumMatch(matchId);
    if (!match) return 'not_found';
    if (deriveColiseumMatchStatus(match, nowMs) !== 'pending') return 'not_pending';
    if (match.challengerId === userId) return 'forbidden';
    if (!match.open && match.opponentId && match.opponentId !== userId) return 'forbidden';
    const acceptedAt = new Date(nowMs).toISOString();
    const next: ColiseumMatch = {
        ...match,
        opponentId: userId,
        open: false,
        acceptedAt,
        clockEndsAt: new Date(nowMs + DEFAULT_MATCH_CLOCK_MS).toISOString(),
        declinedAt: undefined,
    };
    return refreshStatus(next, nowMs);
}

export function declineMatch(
    matchId: string,
    userId: string,
    nowMs: number = Date.now()
): ColiseumMatch | 'not_found' | 'forbidden' | 'not_pending' {
    const match = db.getColiseumMatch(matchId);
    if (!match) return 'not_found';
    if (deriveColiseumMatchStatus(match, nowMs) !== 'pending') return 'not_pending';
    if (!match.open && match.opponentId && match.opponentId !== userId) return 'forbidden';
    const next: ColiseumMatch = { ...match, declinedAt: new Date(nowMs).toISOString() };
    db.upsertColiseumMatch(next);
    return next;
}

/** Record that the Challenge Link was opened (the dodge ping). */
export function markChallengeSeen(matchId: string): ColiseumMatch | null {
    const match = db.getColiseumMatch(matchId);
    if (!match) return null;
    if (match.acceptedAt || match.declinedAt || match.challengeSeenAt) return match;
    const next: ColiseumMatch = { ...match, challengeSeenAt: new Date().toISOString() };
    db.upsertColiseumMatch(next);
    return next;
}

export function challengeStatusFor(match: ColiseumMatch): ColiseumChallengeStatus {
    return deriveChallengeStatus({
        accepted: Boolean(match.acceptedAt),
        declinedAt: match.declinedAt,
        seenAt: match.challengeSeenAt,
        open: match.open,
    });
}

export function listRounds(matchId: string): ColiseumRound[] {
    return db
        .listColiseumRounds()
        .filter((r) => r.matchId === matchId)
        .sort((a, b) => a.index - b.index);
}

export interface PostRoundInput {
    matchId: string;
    authorId: string;
    kind: ColiseumRoundKind;
    body?: string;
    media?: ColiseumArgumentMedia;
    citations?: ColiseumCitation[];
}

export type PostRoundResult =
    | { ok: true; round: ColiseumRound }
    | {
          ok: false;
          reason: 'not_found' | 'forbidden' | 'not_live' | 'duration' | 'steelman_required';
      };

export function postRound(input: PostRoundInput, nowMs: number = Date.now()): PostRoundResult {
    const match = db.getColiseumMatch(input.matchId);
    if (!match) return { ok: false, reason: 'not_found' };
    if (deriveColiseumMatchStatus(match, nowMs) !== 'live')
        return { ok: false, reason: 'not_live' };
    const side = sideForFighter(match, input.authorId);
    if (!side) return { ok: false, reason: 'forbidden' };
    if (!isWithinRoundDurationCap(input.media)) return { ok: false, reason: 'duration' };

    // Steel-manning gate: a fighter cannot post a rebuttal until they have first
    // posted a steel-man round summarizing the opponent's position.
    if (input.kind === 'rebuttal') {
        const priorSteelman = db
            .listColiseumRounds()
            .some(
                (r) =>
                    r.matchId === match.id && r.authorId === input.authorId && r.kind === 'steelman'
            );
        if (!priorSteelman) return { ok: false, reason: 'steelman_required' };
    }

    const index = listRounds(match.id).length;
    const round: ColiseumRound = {
        id: newRoundId(),
        matchId: match.id,
        index,
        side,
        authorId: input.authorId,
        kind: input.kind,
        body: input.body,
        media: input.media,
        citations: input.citations ?? [],
        createdAt: new Date(nowMs).toISOString(),
    };
    db.upsertColiseumRound(round);
    return { ok: true, round };
}

export function castRoundVote(
    input: { matchId: string; roundIndex: number; voterId: string; choice: ColiseumRoundChoice },
    nowMs: number = Date.now()
): ColiseumRoundVote | null {
    const match = db.getColiseumMatch(input.matchId);
    if (!match) return null;
    // Fighters argue blind; they may not vote on their own match.
    if (sideForFighter(match, input.voterId)) return null;
    const vote: ColiseumRoundVote = {
        matchId: input.matchId,
        roundIndex: input.roundIndex,
        voterId: input.voterId,
        choice: input.choice,
        createdAt: new Date(nowMs).toISOString(),
    };
    db.upsertColiseumRoundVote(vote);
    return vote;
}

export function roundTally(matchId: string, roundIndex: number): RoundTally {
    const votes = db
        .listColiseumRoundVotes()
        .filter((v) => v.matchId === matchId && v.roundIndex === roundIndex);
    return tallyRoundVotes(votes);
}

/** Force the match into its Crucible window (clock expires now). */
export function openCrucible(matchId: string, nowMs: number = Date.now()): ColiseumMatch | null {
    const match = db.getColiseumMatch(matchId);
    if (!match) return null;
    const next: ColiseumMatch = {
        ...match,
        clockEndsAt: new Date(nowMs).toISOString(),
        crucibleEndsAt: new Date(nowMs + CRUCIBLE_DURATION_MS).toISOString(),
    };
    return refreshStatus(next, nowMs);
}

export function postFinalStatement(
    input: { matchId: string; authorId: string; body?: string; mediaMxc?: string },
    nowMs: number = Date.now()
): { ok: true } | { ok: false; reason: 'not_found' | 'forbidden' | 'not_crucible' } {
    const match = db.getColiseumMatch(input.matchId);
    if (!match) return { ok: false, reason: 'not_found' };
    if (deriveColiseumMatchStatus(match, nowMs) !== 'crucible') {
        return { ok: false, reason: 'not_crucible' };
    }
    const side = sideForFighter(match, input.authorId);
    if (!side) return { ok: false, reason: 'forbidden' };
    db.upsertColiseumCrucibleStatement({
        matchId: match.id,
        side,
        authorId: input.authorId,
        body: input.body,
        mediaMxc: input.mediaMxc,
        createdAt: new Date(nowMs).toISOString(),
    });
    return { ok: true };
}

export function castSynthesisVote(
    input: { matchId: string; questionId: string; voterId: string; choice: CrucibleChoice },
    nowMs: number = Date.now()
): { ok: true } | { ok: false; reason: 'not_found' | 'forbidden' | 'not_crucible' } {
    const match = db.getColiseumMatch(input.matchId);
    if (!match) return { ok: false, reason: 'not_found' };
    if (deriveColiseumMatchStatus(match, nowMs) !== 'crucible') {
        return { ok: false, reason: 'not_crucible' };
    }
    // Fighters do not vote on their own match.
    if (sideForFighter(match, input.voterId)) return { ok: false, reason: 'forbidden' };
    db.upsertColiseumCrucibleVote({
        matchId: match.id,
        questionId: input.questionId,
        voterId: input.voterId,
        choice: input.choice,
        createdAt: new Date(nowMs).toISOString(),
    });
    return { ok: true };
}

function fighterForSide(match: ColiseumMatch, side: ColiseumSide): string | undefined {
    return side === 'red' ? match.challengerId : match.opponentId;
}

function awardFighterReputation(match: ColiseumMatch, verdict: CrucibleVerdict): void {
    const subject = match.domain;
    const winner = verdict.winner;
    if (winner === null) {
        for (const userId of [match.challengerId, match.opponentId]) {
            if (!userId) continue;
            recordReputationEvent({
                userId,
                type: 'match_drawn',
                subject,
                dedupeKey: `match_drawn:${match.id}:${userId}`,
                actor: 'coliseum:verdict',
                detail: { matchId: match.id },
            });
        }
    } else {
        const winnerId = fighterForSide(match, winner);
        if (winnerId) {
            recordReputationEvent({
                userId: winnerId,
                type: 'match_won',
                subject,
                dedupeKey: `match_won:${match.id}`,
                actor: 'coliseum:verdict',
                detail: { matchId: match.id },
            });
        }
    }
    // Per-round awards from each round's crowd tally: the leading side earns
    // `round_won`, and a steel-man round whose author's side led its tally
    // additionally earns `steelman_passed` — the crowd judged the summary of
    // the opponent's position stronger than the opponent's own showing.
    for (const round of listRounds(match.id)) {
        const tally = roundTally(match.id, round.index);
        if (tally.leader === 'draw') continue;
        const roundWinnerId = fighterForSide(match, tally.leader);
        if (!roundWinnerId) continue;
        recordReputationEvent({
            userId: roundWinnerId,
            type: 'round_won',
            subject,
            dedupeKey: `round_won:${match.id}:${round.index}`,
            actor: 'coliseum:crowd-tally',
            detail: { matchId: match.id, roundIndex: round.index },
        });
        if (round.kind === 'steelman' && tally.leader === round.side) {
            recordReputationEvent({
                userId: roundWinnerId,
                type: 'steelman_passed',
                subject,
                dedupeKey: `steelman_passed:${match.id}:${round.index}`,
                actor: 'coliseum:crowd-tally',
                detail: { matchId: match.id, roundIndex: round.index },
            });
        }
    }
    // A lopsided evidence ruling in the Crucible is a credibility strike
    // against the side the crowd ruled overwhelmingly against.
    const struckSide = deriveCredibilityStrike(verdict.breakdown);
    if (struckSide) {
        const struckId = fighterForSide(match, struckSide);
        if (struckId) {
            recordReputationEvent({
                userId: struckId,
                type: 'credibility_strike',
                subject,
                dedupeKey: `credibility_strike:${match.id}`,
                actor: 'coliseum:verdict',
                detail: { matchId: match.id },
            });
        }
    }
}

/**
 * Close the match: tally the Crucible, mint the immutable Brief, record fighter
 * reputation. Idempotent — if a brief already exists it is returned unchanged.
 */
export function mintVerdict(matchId: string, nowMs: number = Date.now()): ColiseumBrief | null {
    const match = db.getColiseumMatch(matchId);
    if (!match) return null;

    const existing = db.listColiseumBriefs().find((b) => b.matchId === matchId);
    if (existing) return existing;

    const synthesisVotes = db.listColiseumCrucibleVotes().filter((v) => v.matchId === matchId);
    const verdict = deriveCrucibleVerdict({ matchId, synthesisVotes, nowMs });

    const brief = mintBrief({
        id: newBriefId(),
        matchId,
        proposition: match.proposition,
        verdict,
        mintedAt: new Date(nowMs).toISOString(),
    });
    db.upsertColiseumBrief(brief);

    const verdictAt = new Date(nowMs).toISOString();
    db.upsertColiseumMatch({ ...match, verdictAt, status: 'verdict' });
    awardFighterReputation(match, verdict);

    return brief;
}

export function getBrief(id: string): ColiseumBrief | null {
    return db.getColiseumBrief(id) ?? null;
}

export function getBriefForMatch(matchId: string): ColiseumBrief | null {
    return db.listColiseumBriefs().find((b) => b.matchId === matchId) ?? null;
}

export interface BriefFilter {
    fighterId?: string;
    /** Restrict to briefs whose match was tagged with this domain. */
    domain?: ColiseumTopicCategoryKey;
    /** Free-text match over the proposition and claim texts. */
    query?: string;
}

/** A brief plus the domain its match was tagged with — the searchable record. */
export interface BriefEntry {
    brief: ColiseumBrief;
    domain?: ColiseumTopicCategoryKey;
}

function briefMatchesQuery(brief: ColiseumBrief, query: string): boolean {
    const q = query.toLowerCase();
    if (brief.proposition.toLowerCase().includes(q)) return true;
    return brief.claims.some((claim) => claim.text.toLowerCase().includes(q));
}

/**
 * List minted briefs with their match's domain, newest first. This is the read
 * path for the knowledge repository: briefs are queryable by fighter, by
 * domain, and by free text — not just retrievable by id.
 */
export function listBriefEntries(filter: BriefFilter = {}): BriefEntry[] {
    const query = filter.query?.trim().toLowerCase();
    const entries: BriefEntry[] = [];
    for (const brief of db.listColiseumBriefs()) {
        const match = db.getColiseumMatch(brief.matchId);
        if (filter.fighterId) {
            if (
                !match ||
                (match.challengerId !== filter.fighterId && match.opponentId !== filter.fighterId)
            ) {
                continue;
            }
        }
        if (filter.domain && match?.domain !== filter.domain) continue;
        if (query && !briefMatchesQuery(brief, query)) continue;
        entries.push({ brief, domain: match?.domain });
    }
    return entries.sort((a, b) => b.brief.mintedAt.localeCompare(a.brief.mintedAt));
}

export function listBriefs(filter: BriefFilter = {}): ColiseumBrief[] {
    return listBriefEntries(filter).map((entry) => entry.brief);
}
