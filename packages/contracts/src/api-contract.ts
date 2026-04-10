import type {
  ApiMessage as GeneratedApiMessage,
  CastVoteRequest as GeneratedCastVoteRequest,
  CreateMessageRequest as GeneratedCreateMessageRequest,
  CreateVoteRequest as GeneratedCreateVoteRequest,
  FederatedCommunitiesResponse as GeneratedFederatedCommunitiesResponse,
} from './generated';

export const API_VERSION = 'v1' as const;

export const API_DOMAINS = ['auth', 'channels', 'messages', 'governance', 'forum', 'deaddrop', 'moderation', 'federation'] as const;

export const API_ROOTS = {
  v1: '/v1',
  legacyApiAlias: '/api',
} as const;

export type ApiMessage = GeneratedApiMessage;
export type CreateMessageRequest = GeneratedCreateMessageRequest;
export type CreateVoteRequest = GeneratedCreateVoteRequest;
export type CastVoteRequest = GeneratedCastVoteRequest;
export type FederatedCommunitiesResponse = GeneratedFederatedCommunitiesResponse;
