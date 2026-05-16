import React, { type CSSProperties } from 'react';

const MAX_DISPLAYED = 99;

const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 16,
    height: 16,
    padding: '0 5px',
    borderRadius: 8,
    background: 'var(--danger, #e74c3c)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1,
};

export interface ThreadUnreadBadgeProps {
    /** Aggregated unread count from `useThreadUnreadCount`. */
    count: number;
    /** Optional override for the accessible label. */
    ariaLabel?: string;
    /** Override the visual cap. Counts above `maxDisplayed` render as
     * `${maxDisplayed}+`. */
    maxDisplayed?: number;
}

/**
 * Visual badge for the aggregated thread unread count (Workstream C).
 * Renders `null` when `count <= 0` so callers can drop it inline next
 * to a nav entry without conditional wrappers. Counts above
 * `maxDisplayed` (default 99) render as `${maxDisplayed}+`.
 */
export function ThreadUnreadBadge({
    count,
    ariaLabel,
    maxDisplayed = MAX_DISPLAYED,
}: ThreadUnreadBadgeProps) {
    if (!Number.isFinite(count) || count <= 0) return null;
    const cap = Math.max(1, maxDisplayed);
    const display = count > cap ? `${cap}+` : `${count}`;
    const label = ariaLabel ?? `${count} unread thread ${count === 1 ? 'reply' : 'replies'}`;
    return (
        <span
            role="status"
            aria-label={label}
            data-testid="thread-unread-badge"
            data-count={count}
            style={badgeStyle}
        >
            {display}
        </span>
    );
}

export default ThreadUnreadBadge;
