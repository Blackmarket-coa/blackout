import React from 'react';

/**
 * Closes a floating layer on Escape or a pointer-down outside `ref`. Shared by
 * Popover and Menu. Listeners are only attached while `open`.
 */
export const useDismiss = (
    open: boolean,
    ref: React.RefObject<HTMLElement | null>,
    onDismiss: () => void,
): void => {
    React.useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onDismiss();
        };
        const onPointer = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onDismiss();
            }
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onPointer);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onPointer);
        };
    }, [open, ref, onDismiss]);
};
