import type { BlackoutThemeId } from '../../../lib/bmc-core';
import { normalizeThemeId } from '../../../lib/bmc-core';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { trackSettingsSaveFailure } from './settingsTelemetry';

export type SettingsSectionId =
    | 'account'
    | 'appearance'
    | 'notifications'
    | 'privacy'
    | 'privacy-tools'
    | 'data-transparency'
    | 'data-deletion'
    | 'identities'
    | 'voice-video'
    | 'accessibility'
    | 'keybinds'
    | 'developer'
    | 'panic'
    | 'about'
    | 'character-sheet'
    | 'bug-report';
export type ThemeOption = BlackoutThemeId;
export type ChatDensityOption = 'compact' | 'cozy';
export type EmojiStyleOption = 'system' | 'twemoji';
export type TimestampVisibility = 'always' | 'hover' | 'never';
export type NotificationMode = 'all' | 'mentions' | 'muted';
export type DmPermission = 'everyone' | 'friends' | 'mutual-spaces' | 'nobody';

export interface AppearanceSettingsState { theme: ThemeOption; accentColor: string; fontScale: number; chatDensity: ChatDensityOption; emojiStyle: EmojiStyleOption; messageGrouping: boolean; showTimestamps: TimestampVisibility; }
export interface RoomNotificationOverride { roomId: string; mode: NotificationMode; }
export interface CanopyNotificationOverride { canopyId: string; mode: NotificationMode; mutedUntil?: number; }
export interface QuietHoursSettings { enabled: boolean; start: string; end: string; timezoneOffsetMinutes: number; }
export interface NotificationEventToggles { mentions: boolean; replies: boolean; subscriptionEvents: boolean; modAlerts: boolean; }
export interface NotificationSettingsState { globalMode: NotificationMode; perRoomOverrides: RoomNotificationOverride[]; perCanopyOverrides: CanopyNotificationOverride[]; desktopNotifications: boolean; soundEnabled: boolean; soundVolume: number; flashTaskbar: boolean; quietHours: QuietHoursSettings; muteUntil?: number; eventToggles: NotificationEventToggles; }
export interface BlockedUser { id: string; displayName: string; }
export interface PrivacySettingsState { blockedUsers: BlockedUser[]; dmPermissions: DmPermission; showReadReceipts: boolean; showTypingIndicators: boolean; sendReadReceipts: boolean; sendTypingNotifications: boolean; }
export interface AccessibilitySettingsState { reducedMotion: boolean; highContrast: boolean; screenReaderHints: boolean; dyslexiaFriendlyFont: boolean; }
export interface VoiceVideoSettingsState { preferredCamera: 'system' | 'front' | 'rear' | 'virtual'; preferredMicrophone: 'system' | 'headset' | 'built-in'; preferredSpeaker: 'system' | 'headset' | 'built-in'; noiseSuppression: 'off' | 'standard' | 'aggressive'; echoCancellation: boolean; autoGainControl: boolean; mirrorPreview: boolean; pushToTalk: boolean; pushToTalkKey: string; }
export interface KeybindsSettingsState { quickSwitcher: string; toggleMute: string; replyInThread: string; markRoomRead: string; }
export interface DeveloperSettingsState { diagnosticsEnabled: boolean; includeLocalStorageInBundle: boolean; includeFeatureFlagsInBundle: boolean; creatorStudioEnabled: boolean; signingKeyId: string | null; }

const createSafeStorage = () => ({
    getItem: (key: string) => {
        try { return globalThis.localStorage.getItem(key); } catch (error) { trackSettingsSaveFailure(key, 'get', error); return null; }
    },
    setItem: (key: string, value: string) => {
        try { globalThis.localStorage.setItem(key, value); } catch (error) { trackSettingsSaveFailure(key, 'set', error); }
    },
    removeItem: (key: string) => {
        try { globalThis.localStorage.removeItem(key); } catch (error) { trackSettingsSaveFailure(key, 'remove', error); }
    },
});
const createSafeJsonStorage = <T>() => createJSONStorage<T>(createSafeStorage);

export const normalizeAppearanceTheme = (theme: string): ThemeOption => normalizeThemeId(theme);
const appearanceStorage = {
    getItem: (key: string, initialValue: AppearanceSettingsState): AppearanceSettingsState => {
        const raw = createSafeStorage().getItem(key);
        if (!raw) return initialValue;

        try {
            const parsed = JSON.parse(raw) as Partial<AppearanceSettingsState>;
            return {
                ...initialValue,
                ...parsed,
                theme:
                    typeof parsed.theme === 'string'
                        ? normalizeAppearanceTheme(parsed.theme)
                        : initialValue.theme,
            };
        } catch (error) {
            trackSettingsSaveFailure(key, 'get', error);
            return initialValue;
        }
    },
    setItem: (key: string, value: AppearanceSettingsState) => {
        createSafeStorage().setItem(key, JSON.stringify(value));
    },
    removeItem: (key: string) => {
        createSafeStorage().removeItem(key);
    },
};
const getOnInit = { getOnInit: true };

export const settingsPageAtom = atomWithStorage<SettingsSectionId>('blackout.settings.active-section.v1', 'appearance', createSafeJsonStorage<SettingsSectionId>(), getOnInit);
export const appearanceSettingsAtom = atomWithStorage<AppearanceSettingsState>('blackout.settings.appearance.v1', { theme: 'dark_canopy', accentColor: '#4ECDC4', fontScale: 100, chatDensity: 'cozy', emojiStyle: 'twemoji', messageGrouping: true, showTimestamps: 'hover' }, appearanceStorage, getOnInit);
export const notificationSettingsAtom = atomWithStorage<NotificationSettingsState>('blackout.settings.notifications.v2', { globalMode: 'mentions', perRoomOverrides: [], perCanopyOverrides: [], desktopNotifications: true, soundEnabled: true, soundVolume: 70, flashTaskbar: true, quietHours: { enabled: false, start: '22:00', end: '07:00', timezoneOffsetMinutes: new Date().getTimezoneOffset() * -1 }, eventToggles: { mentions: true, replies: true, subscriptionEvents: true, modAlerts: true } }, createSafeJsonStorage<NotificationSettingsState>(), getOnInit);
export const privacySettingsAtom = atomWithStorage<PrivacySettingsState>('blackout.settings.privacy.v1', { blockedUsers: [{ id: '@spam-bot:example.org', displayName: 'Spam Bot' }, { id: '@muted-user:example.org', displayName: 'Muted User' }], dmPermissions: 'friends', showReadReceipts: true, showTypingIndicators: true, sendReadReceipts: true, sendTypingNotifications: true }, createSafeJsonStorage<PrivacySettingsState>(), getOnInit);
export const accessibilitySettingsAtom = atomWithStorage<AccessibilitySettingsState>('blackout.settings.accessibility.v1', { reducedMotion: false, highContrast: false, screenReaderHints: true, dyslexiaFriendlyFont: false }, createSafeJsonStorage<AccessibilitySettingsState>(), getOnInit);
export const voiceVideoSettingsAtom = atomWithStorage<VoiceVideoSettingsState>('blackout.settings.voice-video.v1', { preferredCamera: 'system', preferredMicrophone: 'system', preferredSpeaker: 'system', noiseSuppression: 'standard', echoCancellation: true, autoGainControl: true, mirrorPreview: true, pushToTalk: false, pushToTalkKey: 'space' }, createSafeJsonStorage<VoiceVideoSettingsState>(), getOnInit);
export const keybindsSettingsAtom = atomWithStorage<KeybindsSettingsState>('blackout.settings.keybinds.v1', { quickSwitcher: 'Ctrl+K', toggleMute: 'Ctrl+Shift+M', replyInThread: 'Shift+R', markRoomRead: 'Esc' }, createSafeJsonStorage<KeybindsSettingsState>(), getOnInit);
export const developerSettingsAtom = atomWithStorage<DeveloperSettingsState>('blackout.settings.developer.v1', { diagnosticsEnabled: false, includeLocalStorageInBundle: true, includeFeatureFlagsInBundle: true, creatorStudioEnabled: false, signingKeyId: null }, createSafeJsonStorage<DeveloperSettingsState>(), getOnInit);
