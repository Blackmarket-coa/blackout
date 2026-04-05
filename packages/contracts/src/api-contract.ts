export const API_VERSION = 'v1' as const;

export const API_DOMAINS = ['auth', 'channels', 'messages', 'governance', 'federation'] as const;

export const API_ROOTS = {
  v1: '/v1',
  legacyApiAlias: '/api',
} as const;

export const V1_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
  },
  channels: {
    list: '/channels',
    create: '/channels',
  },
  messages: {
    list: (channelId: string) => `/messages/${channelId}`,
    create: (channelId: string) => `/messages/${channelId}`,
  },
  governance: {
    createVote: '/governance/votes',
    getVote: (voteId: string) => `/governance/votes/${voteId}`,
    castVote: (voteId: string) => `/governance/votes/${voteId}/cast`,
  },
  federation: {
    linkCommunities: '/federation/links',
    communities: '/federation/communities',
  },
} as const;

export interface ApiMessage {
  id: string;
  channelId: string;
  userId: string;
  username?: string;
  content: string;
  contentStegoTier: number;
  createdAt: string;
  governance?: { type: string; data: unknown };
}

export interface CreateMessageRequest {
  content: string;
  stegoTier?: number;
  sign?: boolean;
  userId: string;
  matrixRoomId?: string;
  governance?: { type: string; data: unknown };
}

export interface CreateVoteRequest {
  communityId: string;
  proposerId: string;
  title: string;
  description?: string;
  options?: string[];
  durationHours?: number;
}

export interface CastVoteRequest {
  userId: string;
  choice: string;
  weight?: number;
}

export interface FederatedCommunitiesResponse {
  communities: string[];
}
