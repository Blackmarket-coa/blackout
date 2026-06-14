import React from 'react';
import { cx } from './cx';
import * as styles from './EmptyState.css';

export interface EmptyStateProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
    title: React.ReactNode;
    description?: React.ReactNode;
    /** Optional leading icon/illustration slot. */
    icon?: React.ReactNode;
    /** Optional call-to-action slot (e.g. a Button). */
    action?: React.ReactNode;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
    function EmptyState({ title, description, icon, action, className, ...rest }, ref) {
        return (
            <div ref={ref} className={cx(styles.root, className)} {...rest}>
                {icon ? <div className={styles.icon}>{icon}</div> : null}
                <p className={styles.title}>{title}</p>
                {description ? (
                    <p className={styles.description}>{description}</p>
                ) : null}
                {action ? <div className={styles.action}>{action}</div> : null}
            </div>
        );
    },
);
