import type { EntitlementAccessPayload, EntitlementFamily, PlanState } from '@blackout/protocol';
import type {
  ApiMessage as GeneratedApiMessage,
  CastVoteRequest as GeneratedCastVoteRequest,
  CreateMessageRequest as GeneratedCreateMessageRequest,
  CreateProposalRequest as GeneratedCreateProposalRequest,
  FederatedCommunitiesResponse as GeneratedFederatedCommunitiesResponse,
} from './generated';

export const API_VERSION = 'v1' as const;

export const API_DOMAINS = ['auth', 'channels', 'messages', 'governance', 'forum', 'deaddrop', 'moderation', 'streaming', 'federation', 'entitlements'] as const;

export const API_ROOTS = {
  v1: '/v1',
  legacyApiAlias: '/api',
} as const;

export type ApiMessage = GeneratedApiMessage;
export type CreateMessageRequest = GeneratedCreateMessageRequest;
export type CreateProposalRequest = GeneratedCreateProposalRequest;
export type CastVoteRequest = GeneratedCastVoteRequest;
export type FederatedCommunitiesResponse = GeneratedFederatedCommunitiesResponse;

export interface EntitlementSnapshotResponse {
  family: EntitlementFamily | 'all';
  payload: EntitlementAccessPayload;
  planState: PlanState | null;
}
