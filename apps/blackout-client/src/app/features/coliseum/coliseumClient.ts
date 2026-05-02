import type {
    ColiseumArgument,
    ColiseumCitation,
    ColiseumNewsAnchor,
    ColiseumStance,
    ColiseumTopic,
    ColiseumTopicCategoryKey,
    ColiseumTopicStatus,
    ColiseumVote,
    ColiseumWinnerVerdictResult,
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
    token: string | null = readBlackoutApiToken(),
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
    token: string | null = readBlackoutApiToken(),
): Promise<ColiseumTopicDetailResponse> {
    return getJson<ColiseumTopicDetailResponse>(
        `${COLISEUM_BASE}/topics/${encodeURIComponent(topicId)}`,
        token,
    );
}

export function fetchColiseumVerdict(
    topicId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<ColiseumVerdictResponse> {
    return getJson<ColiseumVerdictResponse>(
        `${COLISEUM_BASE}/verdict/${encodeURIComponent(topicId)}`,
        token,
    );
}

export interface CreateColiseumTopicInput {
    title: string;
    newsAnchor: ColiseumNewsAnchor;
    tags?: string[];
    category?: ColiseumTopicCategoryKey;
    canopyId?: string;
    denId?: string;
    closesAt?: string;
    archivesAt?: string;
}

export function createColiseumTopic(
    input: CreateColiseumTopicInput,
    token: string | null = readBlackoutApiToken(),
): Promise<{ topic: ColiseumTopic }> {
    return postJson<{ topic: ColiseumTopic }>(`${COLISEUM_BASE}/topics`, input, token);
}

export interface CreateColiseumArgumentInput {
    topicId: string;
    stance: ColiseumStance;
    stanceWeight?: number;
    body: string;
    citations?: ColiseumCitation[];
}

export function createColiseumArgument(
    input: CreateColiseumArgumentInput,
    token: string | null = readBlackoutApiToken(),
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
    token: string | null = readBlackoutApiToken(),
): Promise<ColiseumVoteResponse> {
    const { argumentId, ...body } = input;
    return postJson<ColiseumVoteResponse>(
        `${COLISEUM_BASE}/arguments/${encodeURIComponent(argumentId)}/vote`,
        body,
        token,
    );
}
