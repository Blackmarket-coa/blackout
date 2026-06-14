import React from 'react';
import { cx } from './cx';
import * as styles from './Card.css';

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
    { className, children, ...rest },
    ref,
) {
    return (
        <div ref={ref} className={cx(styles.base, className)} {...rest}>
            {children}
        </div>
    );
});
