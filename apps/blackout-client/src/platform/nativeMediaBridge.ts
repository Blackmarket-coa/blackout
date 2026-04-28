export type NativeSharePayload = {
    title?: string;
    text?: string;
    url?: string;
    dialogTitle?: string;
};

type CapacitorBridge = {
    isNativePlatform?: () => boolean;
};

type CapacitorSharePlugin = {
    share?: (options: {
        title?: string;
        text?: string;
        url?: string;
        dialogTitle?: string;
    }) => Promise<unknown>;
};

type ShareDispatchOutcome = 'capacitor' | 'web-share' | 'clipboard' | 'unsupported';

// Optional native deps. Marked dynamic via runtime-built specifier so Vite
// does not try to statically resolve them in browser builds; the wrappers
// inject these modules at runtime when running inside Capacitor.
const CAPACITOR_CORE_MODULE = '@capacitor/core';
const CAPACITOR_SHARE_MODULE = '@capacitor/share';

async function tryCapacitorShare(payload: NativeSharePayload): Promise<boolean> {
    try {
        const core = (await import(/* @vite-ignore */ CAPACITOR_CORE_MODULE)) as {
            Capacitor?: CapacitorBridge;
        };
        if (!core.Capacitor?.isNativePlatform?.()) return false;

        const sharePlugin = (await import(/* @vite-ignore */ CAPACITOR_SHARE_MODULE)) as {
            Share?: CapacitorSharePlugin;
        };
        if (!sharePlugin.Share?.share) return false;

        await sharePlugin.Share.share({
            title: payload.title,
            text: payload.text,
            url: payload.url,
            dialogTitle: payload.dialogTitle ?? 'Share from Blackout',
        });
        return true;
    } catch {
        return false;
    }
}

async function tryWebShare(payload: NativeSharePayload): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
    if (typeof share !== 'function') return false;

    try {
        await share.call(navigator, {
            title: payload.title,
            text: payload.text,
            url: payload.url,
        });
        return true;
    } catch {
        return false;
    }
}

async function tryClipboard(payload: NativeSharePayload): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const clipboard = (navigator as Navigator & {
        clipboard?: { writeText?: (data: string) => Promise<void> };
    }).clipboard;
    if (!clipboard?.writeText) return false;

    const candidate = payload.url ?? payload.text ?? payload.title;
    if (!candidate) return false;

    try {
        await clipboard.writeText(candidate);
        return true;
    } catch {
        return false;
    }
}

/**
 * Share content using the most capable available transport:
 *   1. Capacitor `@capacitor/share` (mobile native sheet)
 *   2. Web Share API (`navigator.share`, available in modern browsers and
 *      most desktop webviews)
 *   3. Clipboard fallback for the canonical url/text
 *
 * Returns the outcome so call sites can show appropriate UI feedback.
 */
export async function nativeShare(payload: NativeSharePayload): Promise<ShareDispatchOutcome> {
    if (await tryCapacitorShare(payload)) return 'capacitor';
    if (await tryWebShare(payload)) return 'web-share';
    if (await tryClipboard(payload)) return 'clipboard';
    return 'unsupported';
}

/**
 * Quick capability probe so call sites can hide a Share button when the
 * environment cannot fulfill it through any transport.
 */
export function nativeCanShare(): boolean {
    if (typeof navigator !== 'undefined') {
        const nav = navigator as Navigator & {
            share?: (data: ShareData) => Promise<void>;
            clipboard?: { writeText?: (data: string) => Promise<void> };
        };
        if (typeof nav.share === 'function') return true;
        if (nav.clipboard?.writeText) return true;
    }
    // Capacitor presence is detected lazily inside nativeShare(); we can't
    // probe synchronously without a dynamic import.
    return false;
}
