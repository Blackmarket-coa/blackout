import React from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { useFocusTrap } from './useFocusTrap';
import * as styles from './Sheet.css';

let sheetSeq = 0;

export interface SheetProps {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    backdropTestId?: string;
}

/**
 * Portal bottom-sheet — the web generalization of the boutique `OverflowSheet`.
 * Closes on Escape and backdrop click, moves focus to the panel on open, and
 * traps Tab inside it while open.
 */
export const Sheet = ({
    open,
    onClose,
    title,
    children,
    className,
    backdropTestId,
}: SheetProps): React.ReactElement | null => {
    const panelRef = React.useRef<HTMLDivElement>(null);
    const titleIdRef = React.useRef<string>();
    if (!titleIdRef.current) titleIdRef.current = `sheet-title-${(sheetSeq += 1)}`;

    useFocusTrap(open, panelRef);

    React.useEffect(() => {
        if (!open) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        panelRef.current?.focus();
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
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleIdRef.current : undefined}
                tabIndex={-1}
                className={cx(styles.panel, className)}
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
