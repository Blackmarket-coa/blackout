import React from 'react';
import { cx } from './cx';
import { useDismiss } from './useDismiss';
import * as styles from './overlay.css';

export interface PopoverProps {
    /** Trigger element — toggles the popover on click. */
    trigger: React.ReactElement;
    children: React.ReactNode;
    placement?: styles.OverlayPlacement;
    /** Controlled open state. Omit for uncontrolled behavior. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    className?: string;
}

export const Popover = ({
    trigger,
    children,
    placement = 'bottom',
    open: controlledOpen,
    onOpenChange,
    className,
}: PopoverProps): React.ReactElement => {
    const [internalOpen, setInternalOpen] = React.useState(false);
    const open = controlledOpen ?? internalOpen;
    const wrapperRef = React.useRef<HTMLSpanElement>(null);

    const setOpen = React.useCallback(
        (next: boolean) => {
            if (controlledOpen === undefined) setInternalOpen(next);
            onOpenChange?.(next);
        },
        [controlledOpen, onOpenChange]
    );

    const close = React.useCallback(() => setOpen(false), [setOpen]);
    useDismiss(open, wrapperRef, close);

    const surfaceRef = React.useRef<HTMLDivElement>(null);

    // Non-modal dialog focus contract: move focus into the surface on open,
    // hand it back to whatever opened the popover on close. No trap — Tab is
    // allowed to leave a non-modal dialog.
    React.useEffect(() => {
        if (!open) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        surfaceRef.current?.focus();
        return () => {
            previouslyFocused?.focus?.();
        };
    }, [open]);

    const triggerEl = React.cloneElement(trigger, {
        onClick: (event: React.MouseEvent) => {
            trigger.props.onClick?.(event);
            setOpen(!open);
        },
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
    });

    return (
        <span ref={wrapperRef} className={cx(styles.anchor, className)}>
            {triggerEl}
            {open ? (
                <div
                    ref={surfaceRef}
                    role="dialog"
                    tabIndex={-1}
                    className={cx(styles.surface, styles.placements[placement])}
                >
                    {children}
                </div>
            ) : null}
        </span>
    );
};
