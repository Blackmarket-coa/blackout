import type {
    ColiseumArgumentMedia,
    ColiseumBrief,
    ColiseumChallengeStatus,
    ColiseumMatch,
    ColiseumResponseDrop,
    ColiseumRound,
    ColiseumRoundChoice,
    ColiseumRoundKind,
    ColiseumShout,
    ColiseumTopicCategoryKey,
    CrucibleChoice,
    RankedResponseDrop,
    RoundTally,
} from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const BASE = '/v1/coliseum';

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}
function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}
function appendQuery(path: string, params: Record<string, string | undefined>): string {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') search.set(k, v);
    }
    const qs = search.toString();
    return qs ? `${path}?${qs}` : path;
}

// --- Matches ---

export interface MatchesResponse {
    generatedAt: string;
    matches: ColiseumMatch[];
}
export interface MatchDetailResponse {
    match: ColiseumMatch;
    rounds: ColiseumRound[];
    tallies?: Array<RoundTally & { roundIndex: number }>;
    challengeStatus: ColiseumChallengeStatus;
    brief: ColiseumBrief | null;
}
export interface MatchResponse {
    match: ColiseumMatch;
    challengeStatus?: ColiseumChallengeStatus;
}
export interface ChallengeLinkResponse {
    token: string | null;
    status: ColiseumChallengeStatus;
    path: string | null;
}

export interface CreateMatchInput {
    proposition: string;
    /**
     * The topic this match is fought over. Sending it is what makes a match
     * show up on its topic's page — the column has existed since matches
     * shipped, but no client ever populated it.
     */
    propositionTopicId?: string;
    domain?: ColiseumTopicCategoryKey;
    opponentId?: string;
    open?: boolean;
    denRoomId?: string;
}

export function fetchColiseumMatches(
    options: {
        domain?: ColiseumTopicCategoryKey;
        status?: ColiseumMatch['status'];
        fighterId?: string;
        propositionTopicId?: string;
        limit?: number;
    } = {},
    token: string | null = readBlackoutApiToken()
): Promise<MatchesResponse> {
    const path = appendQuery(`${BASE}/matches`, {
        domain: options.domain,
        status: options.status,
        fighterId: options.fighterId,
        propositionTopicId: options.propositionTopicId,
        limit: options.limit !== undefined ? String(options.limit) : undefined,
    });
    return getJson<MatchesResponse>(path, token);
}

export function fetchColiseumMatch(
    matchId: string,
    token: string | null = readBlackoutApiToken()
): Promise<MatchDetailResponse> {
    return getJson<MatchDetailResponse>(`${BASE}/matches/${encodeURIComponent(matchId)}`, token);
}

export function createColiseumMatch(
    input: CreateMatchInput,
    token: string | null = readBlackoutApiToken()
): Promise<MatchResponse> {
    return postJson<MatchResponse>(`${BASE}/matches`, input, token);
}

export function acceptColiseumMatch(
    matchId: string,
    token: string | null = readBlackoutApiToken()
): Promise<MatchResponse> {
    return postJson<MatchResponse>(
        `${BASE}/matches/${encodeURIComponent(matchId)}/accept`,
        {},
        token
    );
}
export function declineColiseumMatch(
    matchId: string,
    token: string | null = readBlackoutApiToken()
): Promise<MatchResponse> {
    return postJson<MatchResponse>(
        `${BASE}/matches/${encodeURIComponent(matchId)}/decline`,
        {},
        token
    );
}
export function fetchColiseumChallengeLink(
    matchId: string,
    token: string | null = readBlackoutApiToken()
): Promise<ChallengeLinkResponse> {
    return getJson<ChallengeLinkResponse>(
        `${BASE}/matches/${encodeURIComponent(matchId)}/link`,
        token
    );
}

export interface PostRoundInput {
    kind: ColiseumRoundKind;
    body?: string;
    media?: ColiseumArgumentMedia;
}
export function postColiseumRound(
    matchId: string,
    input: PostRoundInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ round: ColiseumRound }> {
    return postJson<{ round: ColiseumRound }>(
        `${BASE}/matches/${encodeURIComponent(matchId)}/rounds`,
        input,
        token
    );
}
export function castColiseumRoundVote(
    matchId: string,
    roundIndex: number,
    choice: ColiseumRoundChoice,
    token: string | null = readBlackoutApiToken()
): Promise<unknown> {
    return postJson(
        `${BASE}/matches/${encodeURIComponent(matchId)}/rounds/${roundIndex}/vote`,
        { choice },
        token
    );
}
export function openColiseumCrucible(
    matchId: string,
    token: string | null = readBlackoutApiToken()
): Promise<MatchResponse> {
    return postJson<MatchResponse>(
        `${BASE}/matches/${encodeURIComponent(matchId)}/crucible/open`,
        {},
        token
    );
}
export function castColiseumSynthesisVote(
    matchId: string,
    questionId: string,
    choice: CrucibleChoice,
    token: string | null = readBlackoutApiToken()
): Promise<unknown> {
    return postJson(
        `${BASE}/matches/${encodeURIComponent(matchId)}/crucible/synthesis`,
        { questionId, choice },
        token
    );
}
export function mintColiseumVerdict(
    matchId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ brief: ColiseumBrief }> {
    return postJson<{ brief: ColiseumBrief }>(
        `${BASE}/matches/${encodeURIComponent(matchId)}/verdict`,
        {},
        token
    );
}

// --- Briefs ---

export function fetchColiseumBriefs(
    fighterId?: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ briefs: ColiseumBrief[] }> {
    return getJson<{ briefs: ColiseumBrief[] }>(
        appendQuery(`${BASE}/briefs`, { fighter: fighterId }),
        token
    );
}

// --- Shouts ---

export interface ShoutDetailResponse {
    shout: ColiseumShout;
    drops: RankedResponseDrop[];
    bilateral: unknown;
}

export function fetchColiseumShouts(
    domain?: ColiseumTopicCategoryKey,
    token: string | null = readBlackoutApiToken()
): Promise<{ shouts: ColiseumShout[] }> {
    return getJson<{ shouts: ColiseumShout[] }>(appendQuery(`${BASE}/shouts`, { domain }), token);
}
export function fetchColiseumShout(
    shoutId: string,
    token: string | null = readBlackoutApiToken()
): Promise<ShoutDetailResponse> {
    return getJson<ShoutDetailResponse>(`${BASE}/shouts/${encodeURIComponent(shoutId)}`, token);
}
export function createColiseumShout(
    input: {
        body?: string;
        domain?: ColiseumTopicCategoryKey;
        media: ColiseumArgumentMedia;
        denRoomId?: string;
    },
    token: string | null = readBlackoutApiToken()
): Promise<{ shout: ColiseumShout }> {
    return postJson<{ shout: ColiseumShout }>(`${BASE}/shouts`, input, token);
}
export function postColiseumResponseDrop(
    shoutId: string,
    input: { body?: string; media: ColiseumArgumentMedia },
    token: string | null = readBlackoutApiToken()
): Promise<{ drop: ColiseumResponseDrop }> {
    return postJson<{ drop: ColiseumResponseDrop }>(
        `${BASE}/shouts/${encodeURIComponent(shoutId)}/drops`,
        input,
        token
    );
}
export function graduateColiseumShout(
    shoutId: string,
    token: string | null = readBlackoutApiToken()
): Promise<MatchResponse> {
    return postJson<MatchResponse>(
        `${BASE}/shouts/${encodeURIComponent(shoutId)}/graduate`,
        {},
        token
    );
}
