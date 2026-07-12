import React from 'react';

/**
 * What counts as focusable inside a trapped container. Deliberately the
 * common-subset selector (no visibility probing — jsdom reports null
 * offsetParent for everything, and a dialog's contents are visible by
 * definition while it is open).
 */
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Keep Tab / Shift+Tab cycling inside `containerRef` while `active`. This is
 * the primitives-local trap for Modal/Sheet (the app layer uses
 * focus-trap-react; `@blackout/ui` stays dependency-free). Focus restore on
 * close stays the caller's concern — Modal/Sheet already handle it.
 */
export const useFocusTrap = (
    active: boolean,
    containerRef: React.RefObject<HTMLElement | null>
): void => {
    React.useEffect(() => {
        if (!active) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return;
            const container = containerRef.current;
            if (!container) return;

            const focusable = Array.from(
                container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
            );
            if (focusable.length === 0) {
                // Nothing tabbable inside — park focus on the container itself
                // (dialogs render with tabIndex={-1}) instead of letting Tab
                // escape into the page behind the backdrop.
                event.preventDefault();
                container.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const current = document.activeElement as HTMLElement | null;
            const inside = current ? container.contains(current) : false;

            if (event.shiftKey) {
                if (!inside || current === first || current === container) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (!inside || current === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [active, containerRef]);
};
