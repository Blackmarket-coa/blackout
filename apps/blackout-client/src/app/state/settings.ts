import { atom } from 'jotai';
import { normalizeThemeId } from '../../lib/bmc-core';
import {
    defaultAppSettings,
    settingsAtom as appSettingsAtom,
    type AppSettings,
} from './bmc-settings';

const STORAGE_KEY = 'blackout.settings.compat.v1';
const LEGACY_STORAGE_KEY = 'settings';

export type DateFormat = 'D MMM YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY/MM/DD' | '';
export type MessageSpacing = '0' | '100' | '200' | '300' | '400' | '500';
export enum MessageLayout {
    Modern = 0,
    Compact = 1,
    Bubble = 2,
}

export interface Settings {
    themeId?: string;
    useSystemTheme: boolean;
    lightThemeId?: string;
    darkThemeId?: string;
    monochromeMode?: boolean;
    isMarkdown: boolean;
    editorToolbar: boolean;
    twitterEmoji: boolean;
    pageZoom: number;
    hideActivity: boolean;

    isPeopleDrawer: boolean;
    memberSortFilterIndex: number;
    enterForNewline: boolean;
    messageLayout: MessageLayout;
    messageSpacing: MessageSpacing;
    hideMembershipEvents: boolean;
    hideNickAvatarEvents: boolean;
    mediaAutoLoad: boolean;
    urlPreview: boolean;
    encUrlPreview: boolean;
    showHiddenEvents: boolean;
    legacyUsernameColor: boolean;

    showNotifications: boolean;
    isNotificationSounds: boolean;

    hour24Clock: boolean;
    dateFormatString: string;

    developerTools: boolean;
}

const defaultSettings: Settings = {
    themeId: undefined,
    useSystemTheme: true,
    lightThemeId: undefined,
    darkThemeId: undefined,
    monochromeMode: false,
    isMarkdown: true,
    editorToolbar: false,
    twitterEmoji: false,
    pageZoom: 100,
    hideActivity: false,

    isPeopleDrawer: true,
    memberSortFilterIndex: 0,
    enterForNewline: false,
    messageLayout: 0,
    messageSpacing: '400',
    hideMembershipEvents: false,
    hideNickAvatarEvents: true,
    mediaAutoLoad: true,
    urlPreview: true,
    encUrlPreview: false,
    showHiddenEvents: false,
    legacyUsernameColor: false,

    showNotifications: true,
    isNotificationSounds: true,

    hour24Clock: false,
    dateFormatString: 'D MMM YYYY',

    developerTools: false,
};

const modernToLegacyThemeId = (theme: AppSettings['theme']): string => {
    if (theme === 'light_grove' || theme === 'storybook_meadow') return 'light-theme';
    if (theme === 'adventure_spectrum') return 'butter-theme';
    return 'dark-theme';
};

const legacyToModernThemeId = (theme: string | null | undefined): AppSettings['theme'] => {
    if (theme === 'light-theme' || theme === 'silver-theme') return 'light_grove';
    if (theme === 'butter-theme') return 'adventure_spectrum';
    if (theme === 'dark-theme') return 'dark_canopy';
    return normalizeThemeId(theme);
};

const clampPageZoom = (value: number): number => Math.min(200, Math.max(50, value));

const getStoredCompatSettings = (): Settings => {
    try {
        const raw =
            localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw === null) return defaultSettings;

        return {
            ...defaultSettings,
            ...(JSON.parse(raw) as Partial<Settings>),
        };
    } catch {
        return defaultSettings;
    }
};

const persistCompatSettings = (settings: Settings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const resolveAppSettings = (
    appSettings: AppSettings | Promise<AppSettings>,
): AppSettings => (appSettings instanceof Promise ? defaultAppSettings : appSettings);

const getSystemThemeKind = (): 'light' | 'dark' => {
    if (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
        return 'dark';
    }

    return 'light';
};

const resolveLegacyThemeSelection = (settings: Settings): string | undefined => {
    if (!settings.useSystemTheme) return settings.themeId;

    return getSystemThemeKind() === 'dark'
        ? (settings.darkThemeId ?? 'dark-theme')
        : (settings.lightThemeId ?? 'light-theme');
};

const mergeSettings = (compat: Settings, appSettings: AppSettings | Promise<AppSettings>): Settings => {
    const resolvedAppSettings = resolveAppSettings(appSettings);
    const derivedThemeId = modernToLegacyThemeId(resolvedAppSettings.theme);

    return {
        ...compat,
        themeId: compat.themeId ?? derivedThemeId,
        lightThemeId: compat.lightThemeId ?? 'light-theme',
        darkThemeId: compat.darkThemeId ?? 'dark-theme',
        twitterEmoji: resolvedAppSettings.twitterEmoji,
        pageZoom: Math.round(resolvedAppSettings.pageZoom * 100),
        showNotifications: resolvedAppSettings.showNotifications,
        isNotificationSounds: resolvedAppSettings.isNotificationSounds,
        developerTools: resolvedAppSettings.devMode,
    };
};

const compatSettingsBaseAtom = atom<Settings>(getStoredCompatSettings());

export const getSettings = (): Settings => {
    const compatSettings = getStoredCompatSettings();

    try {
        const rawAppSettings = localStorage.getItem('blackout.settings.v1');
        if (!rawAppSettings) return compatSettings;

        const parsed = JSON.parse(rawAppSettings) as Partial<AppSettings>;
        return mergeSettings(compatSettings, {
            ...defaultAppSettings,
            ...parsed,
            theme:
                typeof parsed.theme === 'string'
                    ? normalizeThemeId(parsed.theme)
                    : defaultAppSettings.theme,
            layout: {
                ...defaultAppSettings.layout,
                ...(parsed.layout ?? {}),
            },
        });
    } catch {
        return compatSettings;
    }
};

export const setSettings = (settings: Settings) => {
    persistCompatSettings(settings);
};

export const settingsAtom = atom<Settings, [Settings], undefined>(
    (get) => mergeSettings(get(compatSettingsBaseAtom), get(appSettingsAtom)),
    (get, set, update) => {
        const nextSettings = { ...defaultSettings, ...update };
        set(compatSettingsBaseAtom, nextSettings);
        persistCompatSettings(nextSettings);

        const currentAppSettings = resolveAppSettings(get(appSettingsAtom));
        const nextTheme = legacyToModernThemeId(resolveLegacyThemeSelection(nextSettings));

        set(appSettingsAtom, {
            ...currentAppSettings,
            theme: nextTheme,
            pageZoom: clampPageZoom(nextSettings.pageZoom) / 100,
            twitterEmoji: nextSettings.twitterEmoji,
            showNotifications: nextSettings.showNotifications,
            isNotificationSounds: nextSettings.isNotificationSounds,
            devMode: nextSettings.developerTools,
        });
    },
);
