import React from 'react';
import { cx } from './cx';
import * as styles from './EmptyState.css';

export interface EmptyStateProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
    title: React.ReactNode;
    description?: React.ReactNode;
    /**
     * Leading icon/illustration. Defaults to a neutral "empty tray" glyph so
     * an empty result is visually distinct from a loading skeleton; pass
     * `null` to render no icon.
     */
    icon?: React.ReactNode;
    /** Optional call-to-action slot (e.g. a Button). */
    action?: React.ReactNode;
}

function EmptyTrayIcon() {
    return (
        <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13" />
            <path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-5l-1.5 2.5h-5L8 13H3z" />
        </svg>
    );
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
    function EmptyState(
        { title, description, icon = <EmptyTrayIcon />, action, className, ...rest },
        ref,
    ) {
        return (
            <div
                ref={ref}
                className={cx(styles.root, className)}
                data-empty-state=""
                {...rest}
            >
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
