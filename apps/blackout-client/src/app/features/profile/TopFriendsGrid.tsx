import React, { type CSSProperties } from 'react';
import type { ProfileTopFriends } from './profileTypes';

export interface TopFriendsGridProps {
    topFriends?: ProfileTopFriends;
    /** Optional resolver: given a Matrix user id, return a display name + avatar. */
    resolveMember?: (userId: string) => { displayName: string; avatarUrl?: string };
    /** Default cells to render when topFriends.max is unset. */
    defaultMax?: number;
}

const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
    gap: 10,
};

const cellStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: 8,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
    textDecoration: 'none',
    color: 'var(--text-primary)',
};

const avatarStyle: CSSProperties = {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'var(--bg-input)',
    objectFit: 'cover',
};

const labelStyle: CSSProperties = {
    fontSize: 11,
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
};

function defaultResolveMember(userId: string): { displayName: string; avatarUrl?: string } {
    // Strip the leading @ and the homeserver suffix for a friendly default label.
    const local = userId.replace(/^@/, '').split(':')[0] ?? userId;
    return { displayName: local };
}

export function TopFriendsGrid({
    topFriends,
    resolveMember = defaultResolveMember,
    defaultMax = 8,
}: TopFriendsGridProps) {
    const ids = topFriends?.userIds ?? [];
    const max = topFriends?.max ?? defaultMax;
    const visible = ids.slice(0, max);

    if (visible.length === 0) {
        return (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                No top friends yet.
            </div>
        );
    }

    return (
        <div style={gridStyle} data-testid="top-friends-grid">
            {visible.map((userId) => {
                const member = resolveMember(userId);
                return (
                    <a
                        key={userId}
                        href={`/profile/${encodeURIComponent(userId)}`}
                        style={cellStyle}
                        title={userId}
                    >
                        {member.avatarUrl ? (
                            <img
                                src={member.avatarUrl}
                                alt={member.displayName}
                                style={avatarStyle}
                            />
                        ) : (
                            <div
                                style={{
                                    ...avatarStyle,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: 18,
                                    color: 'var(--text-secondary)',
                                }}
                                aria-hidden
                            >
                                {member.displayName.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <span style={labelStyle}>{member.displayName}</span>
                    </a>
                );
            })}
        </div>
    );
}

export default TopFriendsGrid;
