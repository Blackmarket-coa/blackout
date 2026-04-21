import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { settingsAtom } from '../state/bmc-settings';
import {
    accessibilitySettingsAtom,
    appearanceSettingsAtom,
    notificationSettingsAtom,
} from '../features/settings/settingsAtoms';

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const normalizeHexColor = (value: string): string => {
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;

    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
        const [, r, g, b] = trimmed;
        return `#${r}${r}${g}${g}${b}${b}`;
    }

    return '#4ECDC4';
};

const hexToRgb = (value: string): [number, number, number] => {
    const normalized = normalizeHexColor(value);
    const red = Number.parseInt(normalized.slice(1, 3), 16);
    const green = Number.parseInt(normalized.slice(3, 5), 16);
    const blue = Number.parseInt(normalized.slice(5, 7), 16);
    return [red, green, blue];
};

const rgba = (value: string, alpha: number): string => {
    const [red, green, blue] = hexToRgb(value);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const mixWithWhite = (value: string, ratio: number): string => {
    const [red, green, blue] = hexToRgb(value);
    const mix = (channel: number) => Math.round(channel + (255 - channel) * ratio);
    return `rgb(${mix(red)}, ${mix(green)}, ${mix(blue)})`;
};

export const RuntimeSettingsBridge = () => {
    const appearance = useAtomValue(appearanceSettingsAtom);
    const notifications = useAtomValue(notificationSettingsAtom);
    const accessibility = useAtomValue(accessibilitySettingsAtom);
    const setClientSettings = useSetAtom(settingsAtom);

    useEffect(() => {
        const pageZoom = clamp(appearance.fontScale / 100, 0.75, 1.5);
        const nextChatDensity = appearance.chatDensity === 'compact' ? 'compact' : 'cozy';
        const nextTwitterEmoji = appearance.emojiStyle === 'twemoji';

        setClientSettings((previous) => {
            if (previous instanceof Promise) {
                return previous;
            }

            if (
                previous.theme === appearance.theme &&
                previous.pageZoom === pageZoom &&
                previous.twitterEmoji === nextTwitterEmoji &&
                previous.showNotifications === notifications.desktopNotifications &&
                previous.isNotificationSounds === notifications.soundEnabled &&
                previous.chatDensity === nextChatDensity
            ) {
                return previous;
            }

            return {
                ...previous,
                theme: appearance.theme,
                pageZoom,
                twitterEmoji: nextTwitterEmoji,
                showNotifications: notifications.desktopNotifications,
                isNotificationSounds: notifications.soundEnabled,
                chatDensity: nextChatDensity,
            };
        });
    }, [
        appearance.chatDensity,
        appearance.emojiStyle,
        appearance.fontScale,
        appearance.theme,
        notifications.desktopNotifications,
        notifications.soundEnabled,
        setClientSettings,
    ]);

    useEffect(() => {
        const root = document.documentElement;
        const accentColor = normalizeHexColor(appearance.accentColor);

        root.style.setProperty(
            '--blackout-font-scale',
            String(clamp(appearance.fontScale / 100, 0.75, 1.5)),
        );
        root.style.setProperty(
            '--font-emoji',
            appearance.emojiStyle === 'twemoji' ? "'Twemoji'" : "'Twemoji_DISABLED'",
        );
        root.style.setProperty('--accent-primary', accentColor);
        root.style.setProperty('--accent-hover', mixWithWhite(accentColor, 0.12));
        root.style.setProperty('--accent-muted', rgba(accentColor, 0.18));
        root.dataset.blackoutReducedMotion = String(accessibility.reducedMotion);
        root.dataset.blackoutHighContrast = String(accessibility.highContrast);
        root.dataset.blackoutScreenReaderHints = String(accessibility.screenReaderHints);
        root.dataset.blackoutDyslexiaFriendlyFont = String(accessibility.dyslexiaFriendlyFont);

        if (accessibility.dyslexiaFriendlyFont) {
            root.style.setProperty(
                '--font-secondary',
                'Verdana, "Trebuchet MS", var(--font-emoji), sans-serif',
            );
        } else {
            root.style.removeProperty('--font-secondary');
        }

        return () => {
            root.style.removeProperty('--blackout-font-scale');
            root.style.removeProperty('--accent-primary');
            root.style.removeProperty('--accent-hover');
            root.style.removeProperty('--accent-muted');
            root.style.removeProperty('--font-secondary');
            delete root.dataset.blackoutReducedMotion;
            delete root.dataset.blackoutHighContrast;
            delete root.dataset.blackoutScreenReaderHints;
            delete root.dataset.blackoutDyslexiaFriendlyFont;
        };
    }, [
        accessibility.dyslexiaFriendlyFont,
        accessibility.highContrast,
        accessibility.reducedMotion,
        accessibility.screenReaderHints,
        appearance.accentColor,
        appearance.emojiStyle,
        appearance.fontScale,
    ]);

    return null;
};

export default RuntimeSettingsBridge;
