import { normalizeThemeId } from '../../lib/bmc-core';
import { atomWithStorage } from 'jotai/utils';
import type { ThemePreference } from '../styles/theme-runtime';

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

export const defaultAppSettings: AppSettings = {
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

const appSettingsStorage = {
    getItem: (key: string, initialValue: AppSettings): AppSettings => {
        const raw = localStorage.getItem(key);
        if (!raw) return initialValue;

        try {
            const parsed = JSON.parse(raw) as Partial<AppSettings>;
            return {
                ...initialValue,
                ...parsed,
                theme:
                    typeof parsed.theme === 'string'
                        ? normalizeAppSettingsTheme(parsed.theme)
                        : initialValue.theme,
                layout: {
                    ...initialValue.layout,
                    ...(parsed.layout ?? {}),
                },
            };
        } catch {
            return initialValue;
        }
    },
    setItem: (key: string, value: AppSettings) => {
        localStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: (key: string) => {
        localStorage.removeItem(key);
    },
};

/**
 * Persisted client settings for appearance, notifications, and developer toggles.
 */
export const settingsAtom = atomWithStorage<AppSettings>(
    'blackout.settings.v1',
    defaultAppSettings,
    appSettingsStorage,
);
