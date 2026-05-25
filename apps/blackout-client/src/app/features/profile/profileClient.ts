import type { ReputationProfile } from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';
import type { BmcProfileEvent, MemberProfile } from './profileTypes';

const PROFILE_BASE = '/v1/profile';
const REPUTATION_BASE = '/v1/reputation';

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

function delJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'DELETE', path }) as Promise<T>;
}

const FOLLOWS_BASE = '/v1/follows';

export interface FollowUserSummary {
    /** Blackout user id (the follow-graph key). */
    userId: string;
    username: string;
    /** Matrix id, used to fetch the user's profile/status/wall. */
    matrixUserId: string | null;
}

export function followUser(
    followeeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: boolean; following: boolean; created: boolean }> {
    return postJson(FOLLOWS_BASE, { followeeId }, token);
}

export function unfollowUser(
    followeeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: boolean; following: boolean; removed: boolean }> {
    return delJson(`${FOLLOWS_BASE}/${encodeURIComponent(followeeId)}`, token);
}

export function fetchFollowing(
    token: string | null = readBlackoutApiToken()
): Promise<{ following: FollowUserSummary[] }> {
    return getJson(`${FOLLOWS_BASE}/following`, token);
}

export function fetchFollowers(
    token: string | null = readBlackoutApiToken()
): Promise<{ followers: FollowUserSummary[] }> {
    return getJson(`${FOLLOWS_BASE}/followers`, token);
}

function putJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'PUT', path, body }) as Promise<T>;
}

function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

export function fetchProfile(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<MemberProfile> {
    return getJson<MemberProfile>(`${PROFILE_BASE}/${encodeURIComponent(userId)}`, token);
}

export function saveProfile(
    userId: string,
    input: SaveProfileInput,
    token: string | null = readBlackoutApiToken()
): Promise<MemberProfile> {
    return putJson<MemberProfile>(`${PROFILE_BASE}/${encodeURIComponent(userId)}`, input, token);
}

export function fetchWall(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<FetchWallResponse> {
    return getJson<FetchWallResponse>(`${PROFILE_BASE}/${encodeURIComponent(userId)}/wall`, token);
}

export function postWall(
    userId: string,
    body: string,
    token: string | null = readBlackoutApiToken()
): Promise<WallPost> {
    return postJson<WallPost>(
        `${PROFILE_BASE}/${encodeURIComponent(userId)}/wall`,
        { body },
        token
    );
}

export interface FetchReputationResponse {
    userId: string;
    generatedAt: string;
    reputation: ReputationProfile;
}

export function fetchReputation(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<FetchReputationResponse> {
    return getJson<FetchReputationResponse>(
        `${REPUTATION_BASE}/${encodeURIComponent(userId)}`,
        token
    );
}
