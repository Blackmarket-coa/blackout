import type { DeviceRegistration, MobileSession, SessionRefreshResponse } from './types';

interface JsonValue {
  [key: string]: unknown;
}

export class MobileApiClient {
  constructor(private readonly baseUrl: string) {}

  async refreshSession(session: MobileSession): Promise<SessionRefreshResponse> {
    return this.fetchJson<SessionRefreshResponse>('/v1/auth/refresh', {
      method: 'POST',
      headers: { authorization: `Bearer ${session.refreshToken}` },
    });
  }

  async registerDevice(session: MobileSession, registration: DeviceRegistration): Promise<void> {
    await this.fetchJson<{ ok: true }>('/v1/mobile/devices', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(registration),
    });
  }

  async unregisterDevice(session: MobileSession, pushToken: string): Promise<void> {
    await this.fetchJson<{ ok: true }>('/v1/mobile/devices', {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ pushToken }),
    });
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(`mobile api request failed (${response.status}) for ${path}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }
}
