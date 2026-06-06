import type {
    ContentDistribution,
    ContentKind,
    ContentStatus,
    CreatorContent,
    DistributionTarget,
} from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const CONTENT_BASE = '/v1/creator/content';

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}
function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}
function patchJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'PATCH', path, body }) as Promise<T>;
}

export interface ContentResponse {
    content: CreatorContent[];
}

/** Public Home-feed source: recently published content fanned out to `home`. */
export function fetchHomeContentFeed(
    limit = 30,
    token: string | null = readBlackoutApiToken(),
): Promise<ContentResponse> {
    return getJson<ContentResponse>(`${CONTENT_BASE}/feed?limit=${limit}`, token);
}

/** The signed-in creator's own content library. */
export function fetchMyContent(
    status?: ContentStatus,
    token: string | null = readBlackoutApiToken(),
): Promise<ContentResponse> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return getJson<ContentResponse>(`${CONTENT_BASE}${qs}`, token);
}

export interface CreateContentInput {
    kind: ContentKind;
    title: string;
    body?: string;
    mediaUrl?: string;
    /** ISO timestamp — provide to schedule; omit to save as a draft. */
    scheduledFor?: string;
}

export function createContent(
    input: CreateContentInput,
    token: string | null = readBlackoutApiToken(),
): Promise<{ content: CreatorContent }> {
    return postJson<{ content: CreatorContent }>(CONTENT_BASE, input, token);
}

export function updateContent(
    id: string,
    patch: Partial<Pick<CreatorContent, 'title' | 'body' | 'mediaUrl' | 'status' | 'scheduledFor'>>,
    token: string | null = readBlackoutApiToken(),
): Promise<{ content: CreatorContent }> {
    return patchJson<{ content: CreatorContent }>(
        `${CONTENT_BASE}/${encodeURIComponent(id)}`,
        patch,
        token,
    );
}

export function publishContent(
    id: string,
    token: string | null = readBlackoutApiToken(),
): Promise<{ content: CreatorContent }> {
    return postJson<{ content: CreatorContent }>(
        `${CONTENT_BASE}/${encodeURIComponent(id)}/publish`,
        {},
        token,
    );
}

export interface DistributionsResponse {
    distributions: ContentDistribution[];
}

export function fetchContentDistributions(
    id: string,
    token: string | null = readBlackoutApiToken(),
): Promise<DistributionsResponse> {
    return getJson<DistributionsResponse>(
        `${CONTENT_BASE}/${encodeURIComponent(id)}/distributions`,
        token,
    );
}

export function distributeContent(
    id: string,
    target: DistributionTarget,
    targetId: string | undefined,
    token: string | null = readBlackoutApiToken(),
): Promise<{ distribution: ContentDistribution }> {
    return postJson<{ distribution: ContentDistribution }>(
        `${CONTENT_BASE}/${encodeURIComponent(id)}/distribute`,
        { target, targetId },
        token,
    );
}
