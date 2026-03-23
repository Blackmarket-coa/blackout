const API_BASE_URL = (globalThis as { BLACKOUT_API_URL?: string }).BLACKOUT_API_URL ?? 'http://localhost:8787/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

export interface ApiMessage {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  contentStegoTier: number;
  createdAt: string;
}

export const api = {
  listMessages(channelId: string): Promise<ApiMessage[]> {
    return request<ApiMessage[]>(`/messages/${channelId}`);
  },

  sendMessage(channelId: string, payload: Record<string, unknown>) {
    return request(`/messages/${channelId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  castVote(voteId: string, payload: { userId: string; choice: string }) {
    return request(`/governance/votes/${voteId}/cast`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getVote(voteId: string) {
    return request(`/governance/votes/${voteId}`);
  },

  getFederatedCommunities(ids: string[]) {
    return request<{ communities: string[] }>(`/federation/communities?ids=${encodeURIComponent(ids.join(','))}`);
  },
};

export function websocketUrl(channelId: string): string {
  const url = new URL(API_BASE_URL.replace('/api', '/ws/'));
  url.pathname = `/ws/${channelId}`;
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
