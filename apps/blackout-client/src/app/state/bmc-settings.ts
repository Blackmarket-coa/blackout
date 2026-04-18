import { normalizeThemeId } from '../../lib/bmc-core';
import { designShellLayout } from '../../../../../packages/design/src';
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
        spaceColumnWidth: designShellLayout.defaultSpaceColumnWidthPx,
        roomColumnWidth: designShellLayout.defaultRoomColumnWidthPx,
    },
    mobileRoomListScope: 'space',
};

export const normalizeAppSettingsTheme = (theme: string): ThemePreference =>
    normalizeThemeId(theme);

const baseAppSettingsStorage = createJSONStorage<AppSettings>(() => localStorage);
const appSettingsStorage: typeof baseAppSettingsStorage = {
    ...baseAppSettingsStorage,
    getItem: (key, initialValue) => {
        const value = baseAppSettingsStorage.getItem(key, initialValue);
        if (value && typeof value === 'object' && typeof value.theme === 'string') {
            return { ...value, theme: normalizeAppSettingsTheme(value.theme) };
        }
        return value;
    },
};

/**
 * Persisted client settings for appearance, notifications, and developer toggles.
 */
export const settingsAtom = atomWithStorage<AppSettings>(
    'blackout.settings.v1',
    defaultSettings,
    appSettingsStorage,
);
