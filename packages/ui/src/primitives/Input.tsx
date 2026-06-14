import React from 'react';
import { cx } from './cx';
import * as styles from './Input.css';

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> {
    /** Applies error styling and sets `aria-invalid`. */
    invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    function Input({ invalid, className, ...rest }, ref) {
        return (
            <input
                ref={ref}
                className={cx(
                    styles.base,
                    invalid ? styles.invalid : undefined,
                    className,
                )}
                aria-invalid={invalid || undefined}
                {...rest}
            />
        );
    },
);
