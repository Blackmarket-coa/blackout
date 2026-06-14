import React from 'react';
import { cx } from './cx';
import { Spinner } from './Spinner';
import * as styles from './Button.css';

export type ButtonTone = 'primary' | 'neutral' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    tone?: ButtonTone;
    size?: ButtonSize;
    /** Renders a Spinner, disables the button, and sets `aria-busy`. */
    loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    function Button(
        {
            tone = 'primary',
            size = 'md',
            loading = false,
            type = 'button',
            disabled,
            className,
            children,
            ...rest
        },
        ref,
    ) {
        return (
            <button
                ref={ref}
                type={type}
                className={cx(
                    styles.base,
                    styles.sizes[size],
                    styles.tones[tone],
                    className,
                )}
                disabled={disabled || loading}
                aria-busy={loading || undefined}
                {...rest}
            >
                {loading ? <Spinner size="sm" /> : null}
                {children}
            </button>
        );
    },
);
