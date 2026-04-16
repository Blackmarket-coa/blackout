import type { BlackoutThemeId } from '../../../lib/bmc-core';
import { normalizeThemeId } from '../../../lib/bmc-core';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { trackSettingsSaveFailure, trackSettingsSaveOutcome } from './settingsTelemetry';

export type SettingsSectionId =
    | 'account'
    | 'appearance'
    | 'notifications'
    | 'privacy'
    | 'voice-video'
    | 'accessibility'
    | 'keybinds'
    | 'developer'
    | 'monetization-plan'
    | 'monetization-billing'
    | 'monetization-boost'
    | 'monetization-marketplace'
    | 'monetization-theme-packs'
    | 'about';
export type ThemeOption = BlackoutThemeId;
export type ChatDensityOption = 'compact' | 'cozy';
export type EmojiStyleOption = 'system' | 'twemoji';
export type TimestampVisibility = 'always' | 'hover' | 'never';
export type NotificationMode = 'all' | 'mentions' | 'muted';
export type DmPermission = 'everyone' | 'friends' | 'mutual-spaces' | 'nobody';

export interface AppearanceSettingsState { theme: ThemeOption; accentColor: string; fontScale: number; chatDensity: ChatDensityOption; emojiStyle: EmojiStyleOption; messageGrouping: boolean; showTimestamps: TimestampVisibility; }
export interface RoomNotificationOverride { roomId: string; mode: NotificationMode; }
export interface NotificationSettingsState { globalMode: NotificationMode; perRoomOverrides: RoomNotificationOverride[]; desktopNotifications: boolean; soundEnabled: boolean; soundVolume: number; flashTaskbar: boolean; }
export interface BlockedUser { id: string; displayName: string; }
export interface PrivacySettingsState { blockedUsers: BlockedUser[]; dmPermissions: DmPermission; showReadReceipts: boolean; showTypingIndicators: boolean; }
export interface AccessibilitySettingsState { reducedMotion: boolean; highContrast: boolean; screenReaderHints: boolean; dyslexiaFriendlyFont: boolean; }
export interface VoiceVideoSettingsState { preferredCamera: 'system' | 'front' | 'rear' | 'virtual'; preferredMicrophone: 'system' | 'headset' | 'built-in'; preferredSpeaker: 'system' | 'headset' | 'built-in'; noiseSuppression: 'off' | 'standard' | 'aggressive'; echoCancellation: boolean; autoGainControl: boolean; mirrorPreview: boolean; }
export interface KeybindsSettingsState { quickSwitcher: string; toggleMute: string; replyInThread: string; markRoomRead: string; }
export interface DeveloperSettingsState { diagnosticsEnabled: boolean; includeLocalStorageInBundle: boolean; includeFeatureFlagsInBundle: boolean; }
export interface MonetizationPlanSettingsState { showPlanVisibility: boolean; showTrialUpsell: boolean; trialState: 'inactive' | 'active' | 'expired'; trialEndsAt: string | null; }
export interface MonetizationBillingSettingsState { defaultBillingCycle: 'monthly' | 'yearly'; showTaxInclusivePricing: boolean; autoOpenInvoices: boolean; confirmBeforeCheckout: boolean; }
export interface MonetizationBoostSettingsState { showBoostEntryPoints: boolean; defaultBoostAudience: 'public' | 'supporters' | 'private'; remindBeforeBoostExpiry: boolean; boostAutoRenew: boolean; }
export interface MonetizationMarketplaceSettingsState { marketplaceVisible: boolean; showSellerProfile: boolean; allowDirectMessages: boolean; autoApproveRepeatBuyers: boolean; vacationMode: boolean; }
export interface MonetizationThemePacksSettingsState { allowThemePackSales: boolean; allowLimitedEditionDrops: boolean; showOwnedPacksInPicker: boolean; enableRevenueShareBadges: boolean; }

const createSafeStorage = () => ({
    getItem: (key: string) => {
        try {
            const value = globalThis.localStorage.getItem(key);
            trackSettingsSaveOutcome(key, 'get', true);
            return value;
        } catch (error) {
            trackSettingsSaveFailure(key, 'get', error);
            trackSettingsSaveOutcome(key, 'get', false);
            return null;
        }
    },
    setItem: (key: string, value: string) => {
        try {
            globalThis.localStorage.setItem(key, value);
            trackSettingsSaveOutcome(key, 'set', true);
        } catch (error) {
            trackSettingsSaveFailure(key, 'set', error);
            trackSettingsSaveOutcome(key, 'set', false);
        }
    },
    removeItem: (key: string) => {
        try {
            globalThis.localStorage.removeItem(key);
            trackSettingsSaveOutcome(key, 'remove', true);
        } catch (error) {
            trackSettingsSaveFailure(key, 'remove', error);
            trackSettingsSaveOutcome(key, 'remove', false);
        }
    },
});
const createSafeJsonStorage = <T>() => createJSONStorage<T>(createSafeStorage);

export const normalizeAppearanceTheme = (theme: string): ThemeOption => normalizeThemeId(theme);
const appearanceStorage = createJSONStorage<AppearanceSettingsState>(createSafeStorage, { reviver: (key, value) => (key === 'theme' && typeof value === 'string' ? normalizeAppearanceTheme(value) : value) });
const getOnInit = { getOnInit: true };

export const settingsPageAtom = atomWithStorage<SettingsSectionId>('blackout.settings.active-section.v1', 'appearance', createSafeJsonStorage<SettingsSectionId>(), getOnInit);
export const appearanceSettingsAtom = atomWithStorage<AppearanceSettingsState>('blackout.settings.appearance.v1', { theme: 'dark_canopy', accentColor: '#4ECDC4', fontScale: 100, chatDensity: 'cozy', emojiStyle: 'twemoji', messageGrouping: true, showTimestamps: 'hover' }, appearanceStorage, getOnInit);
export const notificationSettingsAtom = atomWithStorage<NotificationSettingsState>('blackout.settings.notifications.v1', { globalMode: 'mentions', perRoomOverrides: [], desktopNotifications: true, soundEnabled: true, soundVolume: 70, flashTaskbar: true }, createSafeJsonStorage<NotificationSettingsState>(), getOnInit);
export const privacySettingsAtom = atomWithStorage<PrivacySettingsState>('blackout.settings.privacy.v1', { blockedUsers: [{ id: '@spam-bot:example.org', displayName: 'Spam Bot' }, { id: '@muted-user:example.org', displayName: 'Muted User' }], dmPermissions: 'friends', showReadReceipts: true, showTypingIndicators: true }, createSafeJsonStorage<PrivacySettingsState>(), getOnInit);
export const accessibilitySettingsAtom = atomWithStorage<AccessibilitySettingsState>('blackout.settings.accessibility.v1', { reducedMotion: false, highContrast: false, screenReaderHints: true, dyslexiaFriendlyFont: false }, createSafeJsonStorage<AccessibilitySettingsState>(), getOnInit);
export const voiceVideoSettingsAtom = atomWithStorage<VoiceVideoSettingsState>('blackout.settings.voice-video.v1', { preferredCamera: 'system', preferredMicrophone: 'system', preferredSpeaker: 'system', noiseSuppression: 'standard', echoCancellation: true, autoGainControl: true, mirrorPreview: true }, createSafeJsonStorage<VoiceVideoSettingsState>(), getOnInit);
export const keybindsSettingsAtom = atomWithStorage<KeybindsSettingsState>('blackout.settings.keybinds.v1', { quickSwitcher: 'Ctrl+K', toggleMute: 'Ctrl+Shift+M', replyInThread: 'Shift+R', markRoomRead: 'Esc' }, createSafeJsonStorage<KeybindsSettingsState>(), getOnInit);
export const developerSettingsAtom = atomWithStorage<DeveloperSettingsState>('blackout.settings.developer.v1', { diagnosticsEnabled: false, includeLocalStorageInBundle: true, includeFeatureFlagsInBundle: true }, createSafeJsonStorage<DeveloperSettingsState>(), getOnInit);
export const monetizationPlanSettingsAtom = atomWithStorage<MonetizationPlanSettingsState>('blackout.settings.monetization.plan.v1', { showPlanVisibility: true, showTrialUpsell: true, trialState: 'inactive', trialEndsAt: null }, createSafeJsonStorage<MonetizationPlanSettingsState>(), getOnInit);
export const monetizationBillingSettingsAtom = atomWithStorage<MonetizationBillingSettingsState>('blackout.settings.monetization.billing.v1', { defaultBillingCycle: 'monthly', showTaxInclusivePricing: true, autoOpenInvoices: false, confirmBeforeCheckout: true }, createSafeJsonStorage<MonetizationBillingSettingsState>(), getOnInit);
export const monetizationBoostSettingsAtom = atomWithStorage<MonetizationBoostSettingsState>('blackout.settings.monetization.boost.v1', { showBoostEntryPoints: true, defaultBoostAudience: 'public', remindBeforeBoostExpiry: true, boostAutoRenew: false }, createSafeJsonStorage<MonetizationBoostSettingsState>(), getOnInit);
export const monetizationMarketplaceSettingsAtom = atomWithStorage<MonetizationMarketplaceSettingsState>('blackout.settings.monetization.marketplace.v1', { marketplaceVisible: true, showSellerProfile: true, allowDirectMessages: true, autoApproveRepeatBuyers: false, vacationMode: false }, createSafeJsonStorage<MonetizationMarketplaceSettingsState>(), getOnInit);
export const monetizationThemePacksSettingsAtom = atomWithStorage<MonetizationThemePacksSettingsState>('blackout.settings.monetization.theme-packs.v1', { allowThemePackSales: false, allowLimitedEditionDrops: false, showOwnedPacksInPicker: true, enableRevenueShareBadges: true }, createSafeJsonStorage<MonetizationThemePacksSettingsState>(), getOnInit);
