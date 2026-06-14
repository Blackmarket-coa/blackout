import React from 'react';
import { cx } from './cx';
import * as styles from './Switch.css';

export interface SwitchProps
    extends Omit<
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        'onChange' | 'type'
    > {
    checked: boolean;
    onCheckedChange?: (checked: boolean) => void;
}

/** Accessible toggle (`role="switch"`). Controlled via `checked`. */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
    function Switch({ checked, onCheckedChange, className, disabled, onClick, ...rest }, ref) {
        return (
            <button
                ref={ref}
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                className={cx(styles.track, className)}
                onClick={(event) => {
                    onClick?.(event);
                    if (!event.defaultPrevented) onCheckedChange?.(!checked);
                }}
                {...rest}
            >
                <span className={styles.thumb} aria-hidden />
            </button>
        );
    },
);
