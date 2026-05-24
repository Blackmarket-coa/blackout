import React, { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Icon, IconButton, Icons, Text, color } from 'folds';
import {
    toastQueueAtom,
    useToast,
    type ToastItem,
    type ToastVariant,
} from '../../state/notifications/toast';
import { ToastCard, ToastViewport } from './ToastOutlet.css';

/**
 * Renders the transient-notification queue from `toastQueueAtom`. Mounted
 * once near the app shell root (ClientLayout). Each toast auto-dismisses
 * after its `durationMs`; users can dismiss early. The viewport is
 * `aria-live="polite"` so screen readers announce new toasts without
 * stealing focus.
 */

const VARIANT_STYLE: Record<
    ToastVariant,
    { bg: string; fg: string; icon: typeof Icons.Info }
> = {
    Critical: {
        bg: color.Critical.Container,
        fg: color.Critical.OnContainer,
        icon: Icons.Warning,
    },
    Success: {
        bg: color.Success.Container,
        fg: color.Success.OnContainer,
        icon: Icons.Check,
    },
    Primary: {
        bg: color.Primary.Container,
        fg: color.Primary.OnContainer,
        icon: Icons.Info,
    },
};

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
    useEffect(() => {
        const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
        return () => window.clearTimeout(timer);
    }, [toast.id, toast.durationMs, onDismiss]);

    const variant = VARIANT_STYLE[toast.variant];

    return (
        <Box
            className={ToastCard}
            style={{ backgroundColor: variant.bg, color: variant.fg }}
            role="status"
        >
            <Icon size="100" src={variant.icon} />
            <Text size="T300" style={{ flexGrow: 1 }}>
                {toast.message}
            </Text>
            <IconButton
                size="300"
                radii="300"
                variant="Background"
                aria-label="Dismiss notification"
                onClick={() => onDismiss(toast.id)}
            >
                <Icon size="100" src={Icons.Cross} />
            </IconButton>
        </Box>
    );
}

export function ToastOutlet() {
    const queue = useAtomValue(toastQueueAtom);
    const { dismissToast } = useToast();

    if (queue.length === 0) return null;

    return (
        <div className={ToastViewport} aria-live="polite" aria-atomic="false">
            {queue.map((toast) => (
                <ToastRow key={toast.id} toast={toast} onDismiss={dismissToast} />
            ))}
        </div>
    );
}
