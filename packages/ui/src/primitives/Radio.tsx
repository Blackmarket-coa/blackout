import React from 'react';
import { cx } from './cx';
import * as styles from './Radio.css';

export interface RadioProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label?: React.ReactNode;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
    function Radio({ label, className, disabled, ...rest }, ref) {
        const control = (
            <input
                ref={ref}
                type="radio"
                className={styles.input}
                disabled={disabled}
                {...rest}
            />
        );
        if (label === undefined) return control;
        return (
            <label
                className={cx(styles.root, className)}
                data-disabled={disabled ? 'true' : undefined}
            >
                {control}
                <span>{label}</span>
            </label>
        );
    },
);
