import { atomWithStorage } from 'jotai/utils';
import type { ThemePreference } from '../styles/theme.css';

export type ChatDensity = 'compact' | 'comfortable' | 'cozy';

export interface LayoutSettings {
  spaceColumnWidth: number;
  roomColumnWidth: number;
}

export interface AppSettings {
  theme: ThemePreference;
  pageZoom: number;
  twitterEmoji: boolean;
  showNotifications: boolean;
  isNotificationSounds: boolean;
  chatDensity: ChatDensity;
  devMode: boolean;
  streamerMode: boolean;
  layout: LayoutSettings;
  preferredAudioDeviceId?: string;
  preferredVideoDeviceId?: string;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  pageZoom: 1,
  twitterEmoji: true,
  showNotifications: true,
  isNotificationSounds: true,
  chatDensity: 'comfortable',
  devMode: false,
  streamerMode: false,
  layout: {
    spaceColumnWidth: 64,
    roomColumnWidth: 260,
  },
};

/**
 * Persisted client settings for appearance, notifications, and developer toggles.
 */
export const settingsAtom = atomWithStorage<AppSettings>('blackout.settings.v1', defaultSettings);
