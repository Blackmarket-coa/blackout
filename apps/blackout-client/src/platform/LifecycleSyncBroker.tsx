import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { matrixClientAtom } from '../app/state/auth';
import {
    dispatchNativeBridgeEvent,
    listenForNativeBridgeEvents,
} from './native-bridge-contract';

/**
 * Consumes resume_sync bridge events and triggers an immediate matrix-js-sdk
 * sync retry. Also re-emits resume_sync on Page Visibility transitions
 * (hidden -> visible) so the desktop Tauri webview and plain browser
 * sessions get parity with native mobile foreground/background lifecycle.
 *
 * Mobile (Capacitor) already dispatches resume_sync from the native shell
 * via blackout-mobile/src/mobile-bootstrap.ts; the duplicate dispatch from
 * Page Visibility is harmless because retryImmediately() is idempotent.
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

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                dispatchNativeBridgeEvent({
                    type: 'resume_sync',
                    source: 'web',
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stopBridge();
        };
    }, [mx]);

    return null;
}
