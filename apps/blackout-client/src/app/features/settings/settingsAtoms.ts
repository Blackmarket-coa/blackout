import { atomWithStorage } from 'jotai/utils';

export type SettingsSectionId =
  | 'account'
  | 'appearance'
  | 'notifications'
  | 'privacy'
  | 'voice-video'
  | 'accessibility'
  | 'keybinds'
  | 'developer'
  | 'about';

export type ThemeOption = 'dark' | 'light' | 'amoled';
export type ChatDensityOption = 'compact' | 'cozy';
export type EmojiStyleOption = 'system' | 'twemoji';
export type TimestampVisibility = 'always' | 'hover' | 'never';
export type NotificationMode = 'all' | 'mentions' | 'muted';
export type DmPermission = 'everyone' | 'friends' | 'mutual-spaces' | 'nobody';

export interface AppearanceSettingsState {
  theme: ThemeOption;
  accentColor: string;
  fontScale: number;
  chatDensity: ChatDensityOption;
  emojiStyle: EmojiStyleOption;
  messageGrouping: boolean;
  showTimestamps: TimestampVisibility;
}

export interface RoomNotificationOverride {
  roomId: string;
  mode: NotificationMode;
}

export interface NotificationSettingsState {
  globalMode: NotificationMode;
  perRoomOverrides: RoomNotificationOverride[];
  desktopNotifications: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  flashTaskbar: boolean;
}

export interface BlockedUser {
  id: string;
  displayName: string;
}

export interface PrivacySettingsState {
  blockedUsers: BlockedUser[];
  dmPermissions: DmPermission;
  showReadReceipts: boolean;
  showTypingIndicators: boolean;
}

export const settingsPageAtom = atomWithStorage<SettingsSectionId>('blackout.settings.active-section.v1', 'appearance');

export const appearanceSettingsAtom = atomWithStorage<AppearanceSettingsState>('blackout.settings.appearance.v1', {
  theme: 'dark',
  accentColor: '#4ECDC4',
  fontScale: 100,
  chatDensity: 'cozy',
  emojiStyle: 'twemoji',
  messageGrouping: true,
  showTimestamps: 'hover',
});

export const notificationSettingsAtom = atomWithStorage<NotificationSettingsState>('blackout.settings.notifications.v1', {
  globalMode: 'mentions',
  perRoomOverrides: [],
  desktopNotifications: true,
  soundEnabled: true,
  soundVolume: 70,
  flashTaskbar: true,
});

export const privacySettingsAtom = atomWithStorage<PrivacySettingsState>('blackout.settings.privacy.v1', {
  blockedUsers: [
    { id: '@spam-bot:example.org', displayName: 'Spam Bot' },
    { id: '@muted-user:example.org', displayName: 'Muted User' },
  ],
  dmPermissions: 'friends',
  showReadReceipts: true,
  showTypingIndicators: true,
});
