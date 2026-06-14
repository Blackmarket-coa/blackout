import React from 'react';
import { cx } from './cx';
import * as styles from './Select.css';

export interface SelectProps
    extends React.SelectHTMLAttributes<HTMLSelectElement> {
    /** Applies error styling and sets `aria-invalid`. */
    invalid?: boolean;
}

/** Styled native `<select>`. Pass `<option>` children. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    function Select({ invalid, className, children, ...rest }, ref) {
        return (
            <select
                ref={ref}
                className={cx(styles.base, invalid ? styles.invalid : undefined, className)}
                aria-invalid={invalid || undefined}
                {...rest}
            >
                {children}
            </select>
        );
    },
);
