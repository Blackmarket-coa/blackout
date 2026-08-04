import type {
    ColiseumArgument,
    ColiseumArgumentMedia,
    ColiseumCitation,
    ColiseumExplainer,
    ColiseumKnowledgeEntry,
    ColiseumKnowledgeKind,
    ColiseumLiveSession,
    ColiseumNewsAnchor,
    ColiseumTopicSeed,
    ColiseumStance,
    ColiseumTopic,
    ColiseumTopicCategoryKey,
    ColiseumTopicStatus,
    ColiseumVote,
    ColiseumWinnerVerdictResult,
    PinnedEvidence,
    RankedColiseumArgument,
} from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const COLISEUM_BASE = '/v1/coliseum';

export interface ColiseumScopeQuery {
    canopyId?: string;
    denId?: string;
}

export interface ColiseumTopicsResponse {
    generatedAt: string;
    topics: ColiseumTopic[];
}

export interface ColiseumTopicDetailResponse {
    topic: ColiseumTopic;
    arguments: RankedColiseumArgument[];
}

export interface ColiseumArgumentResponse {
    argument: ColiseumArgument;
}

export interface ColiseumVoteResponse {
    vote: ColiseumVote;
    argument: ColiseumArgument;
}

export interface ColiseumVerdictResponse {
    verdict: ColiseumWinnerVerdictResult;
}

function appendQuery(path: string, params: Record<string, string | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            search.set(key, value);
        }
    }
    const qs = search.toString();
    return qs ? `${path}?${qs}` : path;
}

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}

function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

export interface FetchColiseumTopicsOptions {
    category?: ColiseumTopicCategoryKey;
    tag?: string;
    status?: ColiseumTopicStatus;
    limit?: number;
}

export function fetchColiseumTopics(
    scope: ColiseumScopeQuery,
    options: FetchColiseumTopicsOptions = {},
    token: string | null = readBlackoutApiToken()
): Promise<ColiseumTopicsResponse> {
    const path = appendQuery(`${COLISEUM_BASE}/topics`, {
        canopyId: scope.canopyId,
        denId: scope.denId,
        category: options.category,
        tag: options.tag,
        status: options.status,
        limit: options.limit !== undefined ? String(options.limit) : undefined,
    });
    return getJson<ColiseumTopicsResponse>(path, token);
}

export function fetchColiseumTopic(
    topicId: string,
    token: string | null = readBlackoutApiToken()
): Promise<ColiseumTopicDetailResponse> {
    return getJson<ColiseumTopicDetailResponse>(
        `${COLISEUM_BASE}/topics/${encodeURIComponent(topicId)}`,
        token
    );
}

export function fetchColiseumVerdict(
    topicId: string,
    token: string | null = readBlackoutApiToken()
): Promise<ColiseumVerdictResponse> {
    return getJson<ColiseumVerdictResponse>(
        `${COLISEUM_BASE}/verdict/${encodeURIComponent(topicId)}`,
        token
    );
}

export interface CreateColiseumTopicInput {
    title: string;
    /** How the topic is being proposed — text, link, media, or challenge. */
    seed?: ColiseumTopicSeed;
    /** @deprecated Supply a `link` seed instead; accepted for back-compat. */
    newsAnchor?: ColiseumNewsAnchor;
    tags?: string[];
    category?: ColiseumTopicCategoryKey;
    canopyId?: string;
    denId?: string;
    closesAt?: string;
    archivesAt?: string;
}

export function createColiseumTopic(
    input: CreateColiseumTopicInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ topic: ColiseumTopic }> {
    return postJson<{ topic: ColiseumTopic }>(`${COLISEUM_BASE}/topics`, input, token);
}

/**
 * Register the canopy den backing this topic's discussion. Idempotent and
 * first-writer-wins — `created: false` means someone else linked a den first
 * and the returned topic carries theirs.
 */
export function linkColiseumTopicDen(
    topicId: string,
    denRoomId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ topic: ColiseumTopic; created: boolean }> {
    return postJson<{ topic: ColiseumTopic; created: boolean }>(
        `${COLISEUM_BASE}/topics/${encodeURIComponent(topicId)}/den`,
        { denRoomId },
        token
    );
}

export interface CreateColiseumArgumentInput {
    topicId: string;
    /** When set, this argument rebuts the given argument on the same topic. */
    parentArgumentId?: string;
    stance: ColiseumStance;
    stanceWeight?: number;
    body: string;
    citations?: ColiseumCitation[];
    media?: ColiseumArgumentMedia;
}

export function createColiseumArgument(
    input: CreateColiseumArgumentInput,
    token: string | null = readBlackoutApiToken()
): Promise<ColiseumArgumentResponse> {
    return postJson<ColiseumArgumentResponse>(`${COLISEUM_BASE}/arguments`, input, token);
}

export interface CastColiseumVoteInput {
    argumentId: string;
    direction: 'up' | 'down';
    stanceShift?: number;
}

export function castColiseumVote(
    input: CastColiseumVoteInput,
    token: string | null = readBlackoutApiToken()
): Promise<ColiseumVoteResponse> {
    const { argumentId, ...body } = input;
    return postJson<ColiseumVoteResponse>(
        `${COLISEUM_BASE}/arguments/${encodeURIComponent(argumentId)}/vote`,
        body,
        token
    );
}

// --- Knowledge repository (searchable archive of resolved conflict) ---

export interface ColiseumKnowledgeResponse {
    generatedAt: string;
    entries: ColiseumKnowledgeEntry[];
}

export interface FetchColiseumKnowledgeOptions {
    query?: string;
    domain?: ColiseumTopicCategoryKey;
    kind?: ColiseumKnowledgeKind;
    limit?: number;
}

export function fetchColiseumKnowledge(
    options: FetchColiseumKnowledgeOptions = {},
    token: string | null = readBlackoutApiToken()
): Promise<ColiseumKnowledgeResponse> {
    const path = appendQuery(`${COLISEUM_BASE}/knowledge`, {
        q: options.query,
        domain: options.domain,
        kind: options.kind,
        limit: options.limit !== undefined ? String(options.limit) : undefined,
    });
    return getJson<ColiseumKnowledgeResponse>(path, token);
}

export interface CreateColiseumExplainerInput {
    title: string;
    body: string;
    domain?: ColiseumTopicCategoryKey;
    tags?: string[];
    citations?: ColiseumCitation[];
    /** Opposing arguments the author acknowledges — the steel-man signal. */
    counterpoints?: string[];
}

export function createColiseumExplainer(
    input: CreateColiseumExplainerInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ explainer: ColiseumExplainer }> {
    return postJson<{ explainer: ColiseumExplainer }>(
        `${COLISEUM_BASE}/knowledge/explainers`,
        input,
        token
    );
}

export function voteColiseumExplainer(
    explainerId: string,
    direction: 'up' | 'down',
    token: string | null = readBlackoutApiToken()
): Promise<{ explainer: ColiseumExplainer }> {
    return postJson<{ explainer: ColiseumExplainer }>(
        `${COLISEUM_BASE}/knowledge/explainers/${encodeURIComponent(explainerId)}/vote`,
        { direction },
        token
    );
}

// --- Cross-topic discourse reel (Feature 3) ---

export interface ColiseumReelItem extends RankedColiseumArgument {
    topicId: string;
    topicTitle: string;
}

export interface ColiseumReelResponse {
    generatedAt: string;
    items: ColiseumReelItem[];
    nextOffset: number | null;
}

export interface FetchColiseumReelOptions {
    limit?: number;
    offset?: number;
}

export function fetchColiseumReel(
    options: FetchColiseumReelOptions = {},
    token: string | null = readBlackoutApiToken()
): Promise<ColiseumReelResponse> {
    const path = appendQuery(`${COLISEUM_BASE}/reel`, {
        limit: options.limit !== undefined ? String(options.limit) : undefined,
        offset: options.offset !== undefined ? String(options.offset) : undefined,
    });
    return getJson<ColiseumReelResponse>(path, token);
}

// --- Per-creator public summary (for the public creator profile) ---

export interface CreatorColiseumEntry {
    challengeId: string;
    challengeTitle: string;
    entryId: string;
    title: string;
    votes: number;
    rank: number;
}

export interface CreatorColiseumSummary {
    userId: string;
    challengesRun: Array<{
        id: string;
        title: string;
        description?: string;
        category: string;
        status: string;
    }>;
    entries: CreatorColiseumEntry[];
    wins: number;
    leaderboard: { rank: number; score: number; title: string } | null;
}

/** Public: a creator's Coliseum standing (challenges, wins, leaderboard rank). */
export function fetchCreatorColiseum(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<CreatorColiseumSummary> {
    return getJson<CreatorColiseumSummary>(
        `${COLISEUM_BASE}/creators/${encodeURIComponent(userId)}`,
        token
    );
}

// --- Live debate sessions (Feature 2) ---

export interface ColiseumLiveSessionResponse {
    session: ColiseumLiveSession | null;
}

export function fetchColiseumLiveSession(
    topicId: string,
    token: string | null = readBlackoutApiToken()
): Promise<ColiseumLiveSessionResponse> {
    return getJson<ColiseumLiveSessionResponse>(
        `${COLISEUM_BASE}/live/sessions/${encodeURIComponent(topicId)}`,
        token
    );
}

export function startColiseumLiveSession(
    input: { topicId: string; roomId: string },
    token: string | null = readBlackoutApiToken()
): Promise<{ session: ColiseumLiveSession }> {
    return postJson<{ session: ColiseumLiveSession }>(
        `${COLISEUM_BASE}/live/sessions`,
        input,
        token
    );
}

export function requestColiseumSpeak(
    sessionId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ session: ColiseumLiveSession }> {
    return postJson<{ session: ColiseumLiveSession }>(
        `${COLISEUM_BASE}/live/sessions/${encodeURIComponent(sessionId)}/speak`,
        {},
        token
    );
}

export function grantColiseumSpeak(
    sessionId: string,
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ session: ColiseumLiveSession }> {
    return postJson<{ session: ColiseumLiveSession }>(
        `${COLISEUM_BASE}/live/sessions/${encodeURIComponent(sessionId)}/speak/${encodeURIComponent(
            userId
        )}/grant`,
        {},
        token
    );
}

export function revokeColiseumSpeak(
    sessionId: string,
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ session: ColiseumLiveSession }> {
    return postJson<{ session: ColiseumLiveSession }>(
        `${COLISEUM_BASE}/live/sessions/${encodeURIComponent(sessionId)}/speak/${encodeURIComponent(
            userId
        )}/revoke`,
        {},
        token
    );
}

export function pinColiseumEvidence(
    sessionId: string,
    evidence: PinnedEvidence,
    token: string | null = readBlackoutApiToken()
): Promise<{ session: ColiseumLiveSession }> {
    const body =
        evidence.kind === 'argument'
            ? { argumentId: evidence.argumentId }
            : { citation: evidence.citation };
    return postJson<{ session: ColiseumLiveSession }>(
        `${COLISEUM_BASE}/live/sessions/${encodeURIComponent(sessionId)}/pin`,
        body,
        token
    );
}

export function endColiseumLiveSession(
    sessionId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ session: ColiseumLiveSession }> {
    return postJson<{ session: ColiseumLiveSession }>(
        `${COLISEUM_BASE}/live/sessions/${encodeURIComponent(sessionId)}/end`,
        {},
        token
    );
}
