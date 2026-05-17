import {
    dispatchNativeBridgeEvent,
    listenForNativeBridgeEvents,
} from './native-bridge-contract';

type TauriBridge = {
    event?: {
        listen?: (
            eventName: string,
            handler: (event: { payload?: unknown }) => void
        ) => Promise<() => void>;
    };
    core?: {
        invoke?: (command: string, payload?: unknown) => Promise<unknown>;
    };
};

const DEEP_LINK_SCHEMES = ['matrix:', 'blackout:'] as const;

function isDeepLinkUrl(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    return DEEP_LINK_SCHEMES.some((scheme) => value.startsWith(scheme));
}

function extractDeepLinkUrls(payload: unknown): string[] {
    // The Rust side emits `(argv, cwd)` as a tuple, which arrives as a
    // 2-element array whose first entry is the argv string list. Newer
    // single-instance variants may emit a flat string list or an
    // `{ argv }` object; accept all three shapes.
    if (Array.isArray(payload)) {
        if (payload.every(isDeepLinkUrl)) return payload as string[];
        const argv = payload[0];
        if (Array.isArray(argv)) return argv.filter(isDeepLinkUrl);
        return payload.filter(isDeepLinkUrl);
    }
    if (payload && typeof payload === 'object') {
        const argv = (payload as { argv?: unknown }).argv;
        if (Array.isArray(argv)) return argv.filter(isDeepLinkUrl);
    }
    return [];
}

export async function initDesktopBridge(): Promise<void> {
    const tauri = (globalThis as { __TAURI__?: TauriBridge }).__TAURI__;
    if (!tauri?.event?.listen) return;

    const dispatchUrls = (urls: string[]): void => {
        for (const url of urls) {
            dispatchNativeBridgeEvent({
                type: 'deep_link_opened',
                source: 'desktop',
                url,
            });
        }
    };

    try {
        await tauri.event.listen('deep-link://new-url', (event) => {
            const payload = event.payload;
            const urls = Array.isArray(payload)
                ? payload.filter((value): value is string => typeof value === 'string')
                : [];
            dispatchUrls(urls);
        });
    } catch {
        // Not running in a Tauri shell; safe to ignore.
    }

    // Windows/Linux: when the app is already running and the OS opens a
    // deep link, the URL arrives as argv on the second instance. The
    // single-instance plugin forwards (argv, cwd) as a tuple payload.
    try {
        await tauri.event.listen('single-instance', (event) => {
            dispatchUrls(extractDeepLinkUrls(event.payload));
        });
    } catch {
        // Plugin absent or not yet initialized; safe to ignore.
    }

    if (tauri.core?.invoke) {
        listenForNativeBridgeEvents((event) => {
            if (event.type !== 'unread_count_changed') return;
            void tauri.core?.invoke?.('set_unread_count', { unread: event.unread });
        });
    }
}
