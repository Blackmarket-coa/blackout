import { MobileApiClient } from './mobile-api-client';
import type { DeviceRegistration, MobileSession } from './types';

const SESSION_STORAGE_KEY = 'blackout.mobile.session';
const DEVICE_TOKEN_STORAGE_KEY = 'blackout.mobile.registered.pushToken';
const MAX_RETRY = 5;

export class MobileSessionManager {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly api: MobileApiClient) {}

  load(): MobileSession | null {
    const raw = globalThis.localStorage?.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as MobileSession;
    } catch {
      return null;
    }
  }

  save(session: MobileSession): void {
    globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  clear(): void {
    globalThis.localStorage?.removeItem(SESSION_STORAGE_KEY);
    globalThis.localStorage?.removeItem(DEVICE_TOKEN_STORAGE_KEY);
  }

  scheduleRefresh(session: MobileSession): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    const expiresAtMs = new Date(session.expiresAt).getTime();
    const delayMs = Math.max(5_000, expiresAtMs - Date.now() - 60_000);

    this.refreshTimer = setTimeout(() => {
      void this.refresh(session, 0);
    }, delayMs);
  }

  async registerDeviceWithRetry(session: MobileSession, registration: DeviceRegistration, attempt = 0): Promise<void> {
    const previousToken = globalThis.localStorage?.getItem(DEVICE_TOKEN_STORAGE_KEY);

    try {
      if (previousToken && previousToken !== registration.pushToken) {
        await this.api.unregisterDevice(session, previousToken);
      }

      await this.api.registerDevice(session, registration);
      globalThis.localStorage?.setItem(DEVICE_TOKEN_STORAGE_KEY, registration.pushToken);
    } catch (error) {
      if (attempt >= MAX_RETRY) throw error;

      const delayMs = Math.min(30_000, 1_000 * 2 ** attempt);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      await this.registerDeviceWithRetry(session, registration, attempt + 1);
    }
  }

  private async refresh(session: MobileSession, attempt: number): Promise<void> {
    try {
      const refreshed = await this.api.refreshSession(session);
      const next: MobileSession = {
        ...session,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
      };
      this.save(next);
      this.scheduleRefresh(next);
    } catch {
      if (attempt >= MAX_RETRY) {
        this.clear();
        return;
      }

      const delayMs = Math.min(30_000, 1_000 * 2 ** attempt);
      setTimeout(() => {
        void this.refresh(session, attempt + 1);
      }, delayMs);
    }
  }
}
