import { normalizeThemeId } from '@blackout/core';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
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
    mobileRoomListScope?: 'space' | 'all';
    preferredAudioDeviceId?: string;
    preferredVideoDeviceId?: string;
}

const defaultSettings: AppSettings = {
    theme: 'dark_canopy',
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
    mobileRoomListScope: 'space',
};

export const normalizeAppSettingsTheme = (theme: string): ThemePreference =>
    normalizeThemeId(theme);

const appSettingsStorage = createJSONStorage<AppSettings>(() => localStorage, {
    reviver: (key, value) => {
        if (key === 'theme' && typeof value === 'string') {
            return normalizeAppSettingsTheme(value);
        }
        return value;
    },
});

/**
 * Persisted client settings for appearance, notifications, and developer toggles.
 */
export const settingsAtom = atomWithStorage<AppSettings>(
    'blackout.settings.v1',
    defaultSettings,
    appSettingsStorage,
);
