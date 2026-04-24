export interface Canopy {
  id: string;
  name: string;
  unreadCount: number;
  lastActivityAt: string;
}

export interface ThreadMessage {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  mediaIds?: string[];
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  channelId?: string;
}

export interface ProfileSettings {
  displayName: string;
  handle: string;
  pushEnabled: boolean;
  lowDataMode: boolean;
}
