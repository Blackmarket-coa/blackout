import React from 'react';
import { cx } from './cx';
import * as styles from './TextArea.css';

export interface TextAreaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    /** Applies error styling and sets `aria-invalid`. */
    invalid?: boolean;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
    function TextArea({ invalid, className, ...rest }, ref) {
        return (
            <textarea
                ref={ref}
                className={cx(styles.base, invalid ? styles.invalid : undefined, className)}
                aria-invalid={invalid || undefined}
                {...rest}
            />
        );
    },
);
