import React from 'react';
import { cx } from './cx';
import * as styles from './IconButton.css';

export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    size?: IconButtonSize;
    /**
     * Toggle state. When provided, renders `aria-pressed` and the active
     * styling — use for toolbar toggles (e.g. bold/italic format marks).
     */
    active?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton(
        { size = 'md', active, type = 'button', className, children, ...rest },
        ref,
    ) {
        return (
            <button
                ref={ref}
                type={type}
                className={cx(
                    styles.base,
                    styles.sizes[size],
                    active ? styles.active : undefined,
                    className,
                )}
                aria-pressed={active === undefined ? undefined : active}
                {...rest}
            >
                {children}
            </button>
        );
    },
);
