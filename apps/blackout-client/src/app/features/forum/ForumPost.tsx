import { useMemo } from 'react';
import type { RoomMember } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { RoleBadge } from '../roles/RoleBadge';
import { useUserRoles } from '../roles/useRoles';
import type { ForumPostModel } from './useForum';

const formatTimestamp = (ts: number): string =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ts);

export const ForumPost = ({
    roomId,
    post,
    member,
    onOpen,
}: {
    roomId: string;
    post: ForumPostModel;
    member?: RoomMember;
    onOpen: (eventId: string) => void;
}) => {
    const client = useMatrixClient();
    const authorRoles = useUserRoles(roomId, post.authorId);
    const excerpt = useMemo(
        () => post.body.split('\n').slice(1).join('\n').trim().slice(0, 280),
        [post.body],
    );

    const avatar = useMemo(() => {
        const avatarMxc = member?.getMxcAvatarUrl();
        if (!avatarMxc) return null;
        return client.mxcUrlToHttp(avatarMxc, 48, 48, 'crop');
    }, [client, member]);

    return (
        <button
            type="button"
            onClick={() => onOpen(post.eventId)}
            style={{
                display: 'grid',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                padding: 12,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                    <strong
                        style={{
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {post.title}
                    </strong>
                    {excerpt ? (
                        <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
                            {excerpt}
                        </div>
                    ) : null}
                </div>

                <div style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {formatTimestamp(post.timestamp)}
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {avatar ? (
                        <img
                            src={avatar}
                            alt={member?.name ?? post.authorId}
                            style={{ width: 24, height: 24, borderRadius: '50%' }}
                        />
                    ) : (
                        <span
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: 'var(--accent-muted)',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: 11,
                            }}
                        >
                            {(member?.name || post.authorId).slice(0, 2).toUpperCase()}
                        </span>
                    )}
                    <span>{member?.name ?? post.authorId}</span>
                    <RoleBadge role={authorRoles.data[0] ?? null} compact />
                </div>

                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                    }}
                >
                    <span>{post.replyCount} replies</span>
                    <span>{post.reactionCount} reactions</span>
                </div>
            </div>

            {post.tags.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {post.tags.map((tag) => (
                        <span
                            key={tag}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 999,
                                padding: '2px 8px',
                                fontSize: 12,
                            }}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            ) : null}
        </button>
    );
};

export default ForumPost;
