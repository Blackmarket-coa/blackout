import React from 'react';
import { cx } from './cx';
import * as styles from './Badge.css';

export type BadgeTone = 'neutral' | 'accent' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    tone?: BadgeTone;
    /** When provided, renders a dismiss (×) button invoking this handler. */
    onDismiss?: () => void;
    /** Accessible label for the dismiss button. */
    dismissLabel?: string;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    function Badge(
        { tone = 'neutral', onDismiss, dismissLabel = 'Remove', className, children, ...rest },
        ref,
    ) {
        return (
            <span
                ref={ref}
                className={cx(styles.base, styles.tones[tone], className)}
                {...rest}
            >
                {children}
                {onDismiss ? (
                    <button
                        type="button"
                        aria-label={dismissLabel}
                        className={styles.dismiss}
                        onClick={onDismiss}
                    >
                        ×
                    </button>
                ) : null}
            </span>
        );
    },
);
