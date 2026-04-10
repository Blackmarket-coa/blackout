import type { ApiClient } from './types';

export type WellKnownMatrixClient = Record<string, unknown>;

export const createClientQueries = (client: ApiClient) => ({
    getWellKnownMatrixClient: (homeserverUrl: string) =>
        client<WellKnownMatrixClient>({
            method: 'GET',
            path: new URL('/.well-known/matrix/client', homeserverUrl).toString(),
        }),
    getDeepDiveFeed: <TItem>(path = '/deep-dive-feed.json') =>
        client<TItem[]>({
            method: 'GET',
            path,
        }),
    // Governance
    getGovernanceProposal: (proposalId: string) =>
        client<Record<string, unknown>>({
            method: 'GET',
            path: `/v1/governance/proposals/${proposalId}`,
        }),
    getGovernanceEvents: () =>
        client<Record<string, unknown>[]>({
            method: 'GET',
            path: '/v1/governance/events',
        }),
    // Forum
    listForumPosts: (communityId: string) =>
        client<Record<string, unknown>[]>({
            method: 'GET',
            path: `/v1/forum/posts?communityId=${encodeURIComponent(communityId)}`,
        }),
    getForumEvents: () =>
        client<Record<string, unknown>[]>({
            method: 'GET',
            path: '/v1/forum/events',
        }),
    // Dead drop
    getDeadDropEvents: () =>
        client<Record<string, unknown>[]>({
            method: 'GET',
            path: '/v1/deaddrop/events',
        }),
    // Moderation
    listModerationActions: (communityId: string) =>
        client<Record<string, unknown>[]>({
            method: 'GET',
            path: `/v1/moderation/actions?communityId=${encodeURIComponent(communityId)}`,
        }),
    getModerationEvents: () =>
        client<Record<string, unknown>[]>({
            method: 'GET',
            path: '/v1/moderation/events',
        }),
});
