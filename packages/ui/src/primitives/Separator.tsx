import React from 'react';
import { cx } from './cx';
import * as styles from './Separator.css';

export type SeparatorOrientation = 'horizontal' | 'vertical';

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
    orientation?: SeparatorOrientation;
}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
    function Separator({ orientation = 'horizontal', className, ...rest }, ref) {
        return (
            <div
                ref={ref}
                role="separator"
                aria-orientation={orientation}
                className={cx(
                    styles.base,
                    styles.orientations[orientation],
                    className,
                )}
                {...rest}
            />
        );
    },
);
