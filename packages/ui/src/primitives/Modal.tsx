import React from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { useFocusTrap } from './useFocusTrap';
import * as styles from './Modal.css';

let modalSeq = 0;

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    backdropTestId?: string;
}

/**
 * Portal dialog with a dimmed backdrop. Closes on Escape and backdrop click,
 * moves focus to the dialog on open, traps Tab inside it while open, and
 * restores focus on close.
 */
export const Modal = ({
    open,
    onClose,
    title,
    children,
    className,
    backdropTestId,
}: ModalProps): React.ReactElement | null => {
    const dialogRef = React.useRef<HTMLDivElement>(null);
    const titleIdRef = React.useRef<string>();
    if (!titleIdRef.current) titleIdRef.current = `modal-title-${(modalSeq += 1)}`;

    useFocusTrap(open, dialogRef);

    React.useEffect(() => {
        if (!open) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            previouslyFocused?.focus?.();
        };
    }, [open, onClose]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div className={styles.root} role="presentation">
            <div
                className={styles.backdrop}
                onMouseDown={onClose}
                data-testid={backdropTestId}
                aria-hidden
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleIdRef.current : undefined}
                tabIndex={-1}
                className={cx(styles.dialog, className)}
            >
                {title ? (
                    <h2 id={titleIdRef.current} className={styles.title}>
                        {title}
                    </h2>
                ) : null}
                {children}
            </div>
        </div>,
        document.body
    );
};
