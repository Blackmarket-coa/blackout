import {
  API_ROOTS,
  V1_ENDPOINTS,
  type ApiMessage,
  type CastVoteRequest,
  type CreateMessageRequest,
  type CreateVoteRequest,
  type FederatedCommunitiesResponse,
} from '@blackout/contracts';

const runtimeEnv = (globalThis as { BLACKOUT_ENV?: string }).BLACKOUT_ENV ?? (import.meta as any)?.env?.MODE ?? 'development';
const isLocalEnv = runtimeEnv === 'development' || runtimeEnv === 'local' || runtimeEnv === 'test';
const explicitApiBase =
  (globalThis as { BLACKOUT_API_URL?: string }).BLACKOUT_API_URL ??
  (import.meta as any)?.env?.VITE_API_BASE_URL;
const API_BASE_URL = explicitApiBase ?? (isLocalEnv ? `http://localhost:8787${API_ROOTS.v1}` : API_ROOTS.v1);

const rawMockFlag = (import.meta as any)?.env?.VITE_USE_MOCK_API;
const USE_MOCK_API = rawMockFlag == null ? isLocalEnv : rawMockFlag === 'true';

if (USE_MOCK_API && !isLocalEnv) {
  console.warn('[blackout-web] VITE_USE_MOCK_API is enabled outside local development. Real backend traffic is bypassed.');
}

const mockMessages = new Map<string, ApiMessage[]>();

async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (path.startsWith('/messages/') && (!init?.method || init.method === 'GET')) {
    const channelId = path.split('/').at(-1) ?? 'default';
    return (mockMessages.get(channelId) ?? []) as T;
  }

  if (path.startsWith('/messages/') && init?.method === 'POST') {
    const channelId = path.split('/').at(-1) ?? 'default';
    const payload = init.body ? (JSON.parse(String(init.body)) as CreateMessageRequest) : ({} as CreateMessageRequest);
    const message: ApiMessage = {
      id: crypto.randomUUID(),
      channelId,
      userId: payload.userId,
      content: payload.content,
      contentStegoTier: payload.stegoTier ?? 1,
      createdAt: new Date().toISOString(),
    };
    const existing = mockMessages.get(channelId) ?? [];
    mockMessages.set(channelId, [...existing, message]);
    return ({ message, matrix: null } as T);
  }

  if (path.startsWith('/governance/votes/') && path.endsWith('/cast')) {
    return ({ success: true, tally: { yes: 1 } } as T);
  }

  if (path.startsWith('/governance/votes/') && (!init?.method || init.method === 'GET')) {
    return ({ id: path.split('/').at(-1), title: 'Mock vote', results: { yes: 1 } } as T);
  }

  if (path === '/governance/votes' && init?.method === 'POST') {
    const payload = init.body ? JSON.parse(String(init.body)) : {};
    return ({ id: crypto.randomUUID(), ...payload } as T);
  }

  if (path.startsWith('/federation/communities')) {
    return ({ communities: [] } as T);
  }

  throw new Error(`No mock handler implemented for ${path}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCK_API) {
    return mockRequest<T>(path, init);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  listMessages(channelId: string): Promise<ApiMessage[]> {
    return request<ApiMessage[]>(V1_ENDPOINTS.messages.list(channelId));
  },

  sendMessage(channelId: string, payload: CreateMessageRequest) {
    return request(V1_ENDPOINTS.messages.create(channelId), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  castVote(voteId: string, payload: CastVoteRequest) {
    return request(V1_ENDPOINTS.governance.castVote(voteId), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getVote(voteId: string) {
    return request(V1_ENDPOINTS.governance.getVote(voteId));
  },

  createVote(payload: CreateVoteRequest) {
    return request(V1_ENDPOINTS.governance.createVote, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getFederatedCommunities(ids: string[]) {
    return request<FederatedCommunitiesResponse>(
      `${V1_ENDPOINTS.federation.communities}?ids=${encodeURIComponent(ids.join(','))}`,
    );
  },
};

export function websocketUrl(channelId: string): string {
  const url = new URL(API_BASE_URL.replace(API_ROOTS.v1, '/ws/'));
  url.pathname = `/ws/${channelId}`;
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
