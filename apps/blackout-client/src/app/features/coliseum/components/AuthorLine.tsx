import React from 'react';
import { RelativeTime } from './RelativeTime';
import * as css from './coliseumUi.css';

const AVATAR_PALETTE = ['#1ABC9C', '#E74C3C', '#F1C40F', '#9B59B6', '#3498DB', '#E67E22'];

/** "@alice:server.org" → "alice"; plain names pass through. */
export function displayNameFromUserId(userId: string): string {
    const withoutSigil = userId.startsWith('@') ? userId.slice(1) : userId;
    const localpart = withoutSigil.split(':')[0];
    return localpart || userId;
}

function colorForUserId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i += 1) {
        hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    }
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/**
 * Twitter-style author row: initial avatar, display name, and optional
 * relative timestamp / trailing content.
 */
export function AuthorLine({
    userId,
    timestamp,
    children,
    invert,
}: {
    userId: string;
    timestamp?: string | number;
    /** Trailing content (badges, menus). */
    children?: React.ReactNode;
    /** Force white text for dark media overlays. */
    invert?: boolean;
}) {
    const name = displayNameFromUserId(userId);
    return (
        <div className={css.authorLine} data-testid="coliseum-author-line">
            <span
                className={css.avatarCircle}
                style={{ background: colorForUserId(userId) }}
                aria-hidden
            >
                {name.slice(0, 1)}
            </span>
            <span
                className={css.authorName}
                style={invert ? { color: '#fff' } : undefined}
                title={userId}
            >
                {name}
            </span>
            {timestamp !== undefined ? (
                <>
                    <span className={css.authorMeta} aria-hidden>
                        ·
                    </span>
                    <RelativeTime timestamp={timestamp} />
                </>
            ) : null}
            {children}
        </div>
    );
}

export default AuthorLine;
