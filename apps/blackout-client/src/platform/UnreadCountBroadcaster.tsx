import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { totalUnreadAtom } from '../app/state/bmc-unreads';
import { dispatchNativeBridgeEvent } from './native-bridge-contract';

/**
 * Broadcasts the canonical aggregate unread count over the native bridge so
 * desktop wrappers (Tauri set_unread_count) and any other listeners observe a
 * single source-of-truth value.
 *
 * Source: apps/blackout-client/src/app/state/bmc-unreads.ts (totalUnreadAtom).
 */
export function UnreadCountBroadcaster(): null {
    const total = useAtomValue(totalUnreadAtom);

    useEffect(() => {
        dispatchNativeBridgeEvent({
            type: 'unread_count_changed',
            source: 'web',
            unread: Math.max(0, Math.trunc(total)),
        });
    }, [total]);

    return null;
}
