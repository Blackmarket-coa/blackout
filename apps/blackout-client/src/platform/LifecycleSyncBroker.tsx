import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { matrixClientAtom } from '../app/state/auth';
import {
    dispatchNativeBridgeEvent,
    listenForNativeBridgeEvents,
} from './native-bridge-contract';

const VISIBILITY_COALESCE_MS = 250;

/**
 * Consumes resume_sync bridge events and triggers an immediate matrix-js-sdk
 * sync retry. Also re-emits resume_sync on Page Visibility transitions
 * (hidden -> visible) so the desktop Tauri webview and plain browser
 * sessions get parity with native mobile foreground/background lifecycle.
 *
 * Visibility flapping (browser tab focus thrash, modal/popup focus games,
 * Tauri webview minimize/restore loops) can otherwise stack
 * retryImmediately calls; coalescing on a trailing timer makes one quiet
 * resume per burst.
 */
export function LifecycleSyncBroker(): null {
    const mx = useAtomValue(matrixClientAtom);

    useEffect(() => {
        const stopBridge = listenForNativeBridgeEvents((event) => {
            if (event.type !== 'resume_sync') return;
            try {
                mx?.retryImmediately?.();
            } catch {
                // Sync retry is best-effort; ignore client-side errors.
            }
        });

        if (typeof document === 'undefined') {
            return stopBridge;
        }

        let pendingTimer: ReturnType<typeof setTimeout> | null = null;
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            if (pendingTimer !== null) return;
            pendingTimer = setTimeout(() => {
                pendingTimer = null;
                if (document.visibilityState !== 'visible') return;
                dispatchNativeBridgeEvent({
                    type: 'resume_sync',
                    source: 'web',
                });
            }, VISIBILITY_COALESCE_MS);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (pendingTimer !== null) clearTimeout(pendingTimer);
            stopBridge();
        };
    }, [mx]);

    return null;
}
