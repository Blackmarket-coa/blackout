import { useEffect } from 'react';
import { BACK_INTENT_EVENT } from '../../platform/back-intent';

/**
 * Claim the Android hardware-back press while a modal surface is open.
 *
 * The native shell dispatches a cancelable `blackout:back` before falling
 * through to history navigation (see `platform/back-intent.ts`). Calling
 * `preventDefault()` here makes back dismiss the overlay instead of navigating
 * the page out from under it — the same thing Escape already does on desktop.
 *
 * A no-op on web and desktop, where nothing dispatches the event.
 */
export const useBackIntent = (active: boolean, onBack: () => void): void => {
    useEffect(() => {
        if (!active || typeof window === 'undefined') return undefined;
        const handler = (event: Event) => {
            event.preventDefault();
            onBack();
        };
        window.addEventListener(BACK_INTENT_EVENT, handler);
        return () => window.removeEventListener(BACK_INTENT_EVENT, handler);
    }, [active, onBack]);
};
