import React from 'react';
import { cx } from './cx';
import * as styles from './Checkbox.css';

export interface CheckboxProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    function Checkbox({ label, className, disabled, ...rest }, ref) {
        const control = (
            <input
                ref={ref}
                type="checkbox"
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
