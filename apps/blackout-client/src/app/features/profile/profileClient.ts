import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';
import type { BmcProfileEvent, MemberProfile } from './profileTypes';

const PROFILE_BASE = '/v1/profile';

export interface SaveProfileInput {
    displayName?: string;
    avatarUrl?: string;
    primaryRole?: string;
    roleBadges?: string[];
    mutualSpaces?: string[];
    isFriend?: boolean;
    profile?: BmcProfileEvent;
}

export interface WallPost {
    id: string;
    profileUserId: string;
    authorId: string;
    body: string;
    createdAt: string;
}

export interface FetchWallResponse {
    userId: string;
    posts: WallPost[];
}

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}

function putJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'PUT', path, body }) as Promise<T>;
}

function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

export function fetchProfile(
    userId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<MemberProfile> {
    return getJson<MemberProfile>(`${PROFILE_BASE}/${encodeURIComponent(userId)}`, token);
}

export function saveProfile(
    userId: string,
    input: SaveProfileInput,
    token: string | null = readBlackoutApiToken(),
): Promise<MemberProfile> {
    return putJson<MemberProfile>(`${PROFILE_BASE}/${encodeURIComponent(userId)}`, input, token);
}

export function fetchWall(
    userId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<FetchWallResponse> {
    return getJson<FetchWallResponse>(`${PROFILE_BASE}/${encodeURIComponent(userId)}/wall`, token);
}

export function postWall(
    userId: string,
    body: string,
    token: string | null = readBlackoutApiToken(),
): Promise<WallPost> {
    return postJson<WallPost>(
        `${PROFILE_BASE}/${encodeURIComponent(userId)}/wall`,
        { body },
        token,
    );
}
