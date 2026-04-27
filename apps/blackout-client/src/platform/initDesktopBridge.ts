import { dispatchNativeBridgeEvent } from './native-bridge-contract';

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

export async function initDesktopBridge(): Promise<void> {
    const tauri = (globalThis as { __TAURI__?: TauriBridge }).__TAURI__;
    if (!tauri?.event?.listen) return;

    try {
        await tauri.event.listen('deep-link://new-url', (event) => {
            const payload = event.payload;
            const urls = Array.isArray(payload)
                ? payload.filter((value): value is string => typeof value === 'string')
                : [];
            for (const url of urls) {
                dispatchNativeBridgeEvent({
                    type: 'deep_link_opened',
                    source: 'desktop',
                    url,
                });
            }
        });
    } catch {
        // Not running in a Tauri shell; safe to ignore.
    }
}
