import { atom, useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

/**
 * Minimal app-level transient notifications ("toasts"). The client had no
 * toast/snackbar primitive; this is the first. Kept deliberately small: a
 * jotai-backed queue + a `useToast()` hook. Rendering lives in
 * `components/toast/ToastOutlet.tsx`, mounted once in ClientLayout.
 */

export type ToastVariant = 'Critical' | 'Success' | 'Primary';

export type ToastItem = {
    id: string;
    message: string;
    variant: ToastVariant;
    /** Auto-dismiss delay in ms. */
    durationMs: number;
};

export const toastQueueAtom = atom<ToastItem[]>([]);

export const DEFAULT_TOAST_DURATION_MS = 5000;

let toastSeq = 0;
const nextToastId = (): string => {
    toastSeq += 1;
    return `toast-${Date.now()}-${toastSeq}`;
};

export type ShowToastOptions = {
    variant?: ToastVariant;
    durationMs?: number;
    /** Override id generation (tests). */
    id?: string;
};

/** Pure: build a toast item from a message + options. */
export const buildToast = (message: string, options: ShowToastOptions = {}): ToastItem => ({
    id: options.id ?? nextToastId(),
    message,
    variant: options.variant ?? 'Primary',
    durationMs: options.durationMs ?? DEFAULT_TOAST_DURATION_MS,
});

/** Pure: append a toast to the queue. */
export const appendToast = (queue: ToastItem[], item: ToastItem): ToastItem[] => [...queue, item];

/** Pure: remove a toast by id. */
export const removeToast = (queue: ToastItem[], id: string): ToastItem[] =>
    queue.filter((t) => t.id !== id);

export const useToast = () => {
    const [, setQueue] = useAtom(toastQueueAtom);

    const dismissToast = useCallback(
        (id: string) => {
            setQueue((q) => removeToast(q, id));
        },
        [setQueue]
    );

    const showToast = useCallback(
        (message: string, options: ShowToastOptions = {}): string => {
            const item = buildToast(message, options);
            setQueue((q) => appendToast(q, item));
            return item.id;
        },
        [setQueue]
    );

    return useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);
};
