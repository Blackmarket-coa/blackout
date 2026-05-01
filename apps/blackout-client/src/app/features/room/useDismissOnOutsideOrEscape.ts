import { useEffect, type RefObject } from 'react';

/**
 * Dismiss a popover/dialog on Escape or on a tap-outside.
 *
 * Listens to `pointerdown` (covers mouse + touch + pen — `mousedown` alone is
 * unreliable for outside-tap dismissal on iOS) and `keydown` for Escape.
 *
 * - `active` — gates listener registration. Pass the open/close boolean.
 * - `ref` — when provided, a pointerdown whose target is inside the ref is
 *   ignored (the popover stays open). Pass `null` for Escape-only mode.
 * - Respects `event.defaultPrevented` on Escape so editor-level handlers
 *   (e.g. closing autocomplete suggestions inside a Slate editor) take
 *   precedence.
 */
export function useDismissOnOutsideOrEscape(
    active: boolean,
    ref: RefObject<HTMLElement | null> | null,
    onDismiss: () => void,
): void {
    useEffect(() => {
        if (!active) return undefined;

        const handlePointer = (event: PointerEvent) => {
            if (!ref) return;
            const targetNode = event.target as globalThis.Node | null;
            if (!targetNode) return;
            if (ref.current?.contains(targetNode)) return;
            onDismiss();
        };

        const handleKey = (event: globalThis.KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (event.defaultPrevented) return;
            onDismiss();
        };

        window.addEventListener('pointerdown', handlePointer);
        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('pointerdown', handlePointer);
            window.removeEventListener('keydown', handleKey);
        };
    }, [active, ref, onDismiss]);
}
