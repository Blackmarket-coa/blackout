import React from 'react';
import { cx } from './cx';
import * as styles from './Spinner.css';

export type SpinnerSize = 'sm' | 'md';

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
    size?: SpinnerSize;
    /** Accessible label announced to assistive tech. */
    label?: string;
}

export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
    function Spinner({ size = 'md', label = 'Loading', className, ...rest }, ref) {
        return (
            <span
                ref={ref}
                role="status"
                aria-label={label}
                className={cx(styles.base, styles.sizes[size], className)}
                {...rest}
            />
        );
    },
);
