import React from 'react';
import { cx } from './cx';
import * as styles from './Tooltip.css';

let tooltipSeq = 0;

export interface TooltipProps {
    content: React.ReactNode;
    placement?: styles.TooltipPlacement;
    /** Single focusable trigger element. */
    children: React.ReactElement;
    className?: string;
}

/**
 * Shows `content` on hover and keyboard focus. The trigger must be a single
 * focusable element; it is described by the tooltip via `aria-describedby`.
 */
export const Tooltip = ({
    content,
    placement = 'top',
    children,
    className,
}: TooltipProps): React.ReactElement => {
    const [open, setOpen] = React.useState(false);
    const idRef = React.useRef<string>();
    if (!idRef.current) idRef.current = `tooltip-${(tooltipSeq += 1)}`;
    const id = idRef.current;

    // WAI-ARIA tooltip pattern: Escape hides the tooltip without moving focus.
    React.useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const trigger = React.cloneElement(children, {
        'aria-describedby': open ? id : undefined,
    });

    return (
        <span
            className={cx(styles.wrapper, className)}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onFocusCapture={() => setOpen(true)}
            onBlurCapture={() => setOpen(false)}
        >
            {trigger}
            {open ? (
                <span
                    role="tooltip"
                    id={id}
                    className={cx(styles.bubble, styles.placements[placement])}
                >
                    {content}
                </span>
            ) : null}
        </span>
    );
};
