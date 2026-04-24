import type { Canopy, NotificationItem, ProfileSettings, ThreadMessage } from './types';

export interface MobileSurfaceApi {
  listCanopies(): Promise<Canopy[]>;
  listThreadMessages(channelId: string): Promise<ThreadMessage[]>;
  postMessage(channelId: string, body: string, mediaIds?: string[]): Promise<ThreadMessage>;
  listNotifications(): Promise<NotificationItem[]>;
  markNotificationRead(notificationId: string): Promise<void>;
  getProfileSettings(): Promise<ProfileSettings>;
  saveProfileSettings(input: ProfileSettings): Promise<ProfileSettings>;
}

export class MobileSurfaces {
  constructor(private readonly api: MobileSurfaceApi) {}

  async canopyList(): Promise<Canopy[]> {
    return this.api.listCanopies();
  }

  async channelThread(channelId: string): Promise<ThreadMessage[]> {
    return this.api.listThreadMessages(channelId);
  }

  async composePost(channelId: string, body: string, mediaIds?: string[]): Promise<ThreadMessage> {
    const trimmed = body.trim();
    if (!trimmed) {
      throw new Error('message body is required');
    }

    return this.api.postMessage(channelId, trimmed, mediaIds);
  }

  async notificationsInbox(): Promise<NotificationItem[]> {
    return this.api.listNotifications();
  }

  async markNotificationSeen(notificationId: string): Promise<void> {
    await this.api.markNotificationRead(notificationId);
  }

  async settingsProfile(): Promise<ProfileSettings> {
    return this.api.getProfileSettings();
  }

  async updateSettingsProfile(input: ProfileSettings): Promise<ProfileSettings> {
    return this.api.saveProfileSettings(input);
  }
}
