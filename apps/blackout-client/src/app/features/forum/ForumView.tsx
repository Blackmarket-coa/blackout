import { useMemo, useState } from 'react';
import type { MatrixEvent, RoomMember } from 'matrix-js-sdk';
import { useRoomMembers } from '../../hooks/useRoom';
import { useRoomTimeline, useSendMessage } from '../../hooks/useTimeline';
import { CreatePostModal } from './CreatePostModal';
import { ForumPost } from './ForumPost';
import { useForumPosts, useForumSettings, type ForumPostModel } from './useForum';

type SortMode = 'hot' | 'new' | 'top';
type TopWindow = 'day' | 'week' | 'month';

const scoreHot = (post: ForumPostModel, now: number): number => {
    const hoursSince = Math.max(1, (now - post.timestamp) / (1000 * 60 * 60));
    const recencyWeight = 100 / hoursSince;
    return post.replyCount * 3 + post.reactionCount * 2 + recencyWeight;
};

const scoreTop = (post: ForumPostModel): number => post.replyCount + post.reactionCount;

const windowMs: Record<TopWindow, number> = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
};

const ThreadView = ({
    post,
    replies,
    onBack,
    onReply,
}: {
    post: ForumPostModel;
    replies: MatrixEvent[];
    onBack: () => void;
    onReply: (body: string, rootEventId: string) => Promise<void>;
}) => {
    const [reply, setReply] = useState('');

    return (
        <section style={{ display: 'grid', gap: 10 }}>
            <button
                type="button"
                onClick={onBack}
                style={{
                    justifySelf: 'start',
                    border: '1px solid var(--border-default)',
                    borderRadius: 8,
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    padding: '4px 8px',
                }}
            >
                ← Back to posts
            </button>

            <article
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-input)',
                    padding: 12,
                }}
            >
                <h3 style={{ margin: 0 }}>{post.title}</h3>
                <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0', font: 'inherit' }}>
                    {post.body}
                </pre>
            </article>

            <section
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 12,
                }}
            >
                <strong>Thread replies ({replies.length})</strong>
                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                    {replies.map((event) => {
                        const content = event.getContent<Record<string, unknown>>();
                        const body = typeof content.body === 'string' ? content.body : '';
                        return (
                            <article
                                key={event.getId() ?? String(event.getTs())}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    padding: 8,
                                }}
                            >
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {event.getSender()}
                                </div>
                                <div style={{ marginTop: 4 }}>{body}</div>
                            </article>
                        );
                    })}
                </div>

                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                    <textarea
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        rows={4}
                        placeholder="Reply to this thread"
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: 8,
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (!reply.trim()) return;
                            void onReply(reply.trim(), post.eventId).then(() => setReply(''));
                        }}
                        style={{
                            justifySelf: 'end',
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-surface)',
                            padding: '6px 10px',
                        }}
                    >
                        Reply
                    </button>
                </div>
            </section>
        </section>
    );
};

export const ForumView = ({ roomId }: { roomId: string }) => {
    const forumSettings = useForumSettings(roomId);
    const posts = useForumPosts(roomId);
    const timeline = useRoomTimeline(roomId);
    const members = useRoomMembers(roomId);
    const { sendThread } = useSendMessage(roomId);

    const [sortMode, setSortMode] = useState<SortMode>(forumSettings.data.defaultSort);
    const [topWindow, setTopWindow] = useState<TopWindow>('week');
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

    const memberMap = useMemo(() => {
        const map = new Map<string, RoomMember>();
        members.data.forEach((member) => map.set(member.userId, member));
        return map;
    }, [members.data]);

    const filteredAndSorted = useMemo(() => {
        const now = Date.now();
        const source = activeTag
            ? posts.data.filter((post) => post.tags.includes(activeTag))
            : posts.data;

        const next = [...source];
        if (sortMode === 'new') {
            next.sort((a, b) => b.timestamp - a.timestamp);
        } else if (sortMode === 'top') {
            const threshold = now - windowMs[topWindow];
            next.sort((a, b) => {
                const aInRange = a.timestamp >= threshold;
                const bInRange = b.timestamp >= threshold;
                if (aInRange !== bInRange) return aInRange ? -1 : 1;
                return scoreTop(b) - scoreTop(a);
            });
        } else {
            next.sort((a, b) => scoreHot(b, now) - scoreHot(a, now));
        }

        return next;
    }, [activeTag, posts.data, sortMode, topWindow]);

    const selectedPost = useMemo(
        () => posts.data.find((post) => post.eventId === selectedPostId) ?? null,
        [posts.data, selectedPostId],
    );

    const repliesFromTimeline = useMemo(() => {
        if (!selectedPost) return [] as MatrixEvent[];
        return timeline.data.filter((event) => {
            if (event.getType() !== 'm.room.message') return false;
            const content = event.getContent<Record<string, unknown>>();
            const relates = content['m.relates_to'];
            if (!relates || typeof relates !== 'object') return false;
            const rel = relates as Record<string, unknown>;
            return rel.rel_type === 'm.thread' && rel.event_id === selectedPost.eventId;
        });
    }, [selectedPost, timeline.data]);

    if (!forumSettings.data.enabled) {
        return (
            <section style={{ padding: 12 }}>
                <strong>Forum mode is not enabled for this room.</strong>
            </section>
        );
    }

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <CreatePostModal
                roomId={roomId}
                tags={forumSettings.data.tags}
                requireTag={forumSettings.data.requireTag}
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onPosted={() => undefined}
            />

            <header
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 10,
                    display: 'grid',
                    gap: 8,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                    }}
                >
                    <div>
                        <strong>Forum</strong>
                        {forumSettings.data.guidelines ? (
                            <p
                                style={{
                                    margin: '4px 0 0',
                                    color: 'var(--text-secondary)',
                                    fontSize: 12,
                                    whiteSpace: 'pre-wrap',
                                }}
                            >
                                {forumSettings.data.guidelines}
                            </p>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        style={{
                            alignSelf: 'start',
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-surface)',
                            padding: '6px 10px',
                        }}
                    >
                        Create New Post
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sort:</span>
                    {(['hot', 'new', 'top'] as SortMode[]).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setSortMode(mode)}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 999,
                                background:
                                    sortMode === mode ? 'var(--accent-muted)' : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                padding: '2px 8px',
                                fontSize: 12,
                            }}
                        >
                            {mode.toUpperCase()}
                        </button>
                    ))}

                    {sortMode === 'top' ? (
                        <select
                            value={topWindow}
                            onChange={(event) => setTopWindow(event.target.value as TopWindow)}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                padding: '4px 8px',
                                fontSize: 12,
                            }}
                        >
                            <option value="day">Past day</option>
                            <option value="week">Past week</option>
                            <option value="month">Past month</option>
                        </select>
                    ) : null}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTag(null)}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 999,
                            background:
                                activeTag === null ? 'var(--accent-muted)' : 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '3px 8px',
                            fontSize: 12,
                        }}
                    >
                        All tags
                    </button>
                    {forumSettings.data.tags.map((tag) => (
                        <button
                            key={tag.name}
                            type="button"
                            onClick={() => setActiveTag(tag.name)}
                            style={{
                                border: `1px solid ${tag.color}`,
                                borderRadius: 999,
                                background: activeTag === tag.name ? tag.color : 'transparent',
                                color: activeTag === tag.name ? '#fff' : tag.color,
                                padding: '3px 8px',
                                fontSize: 12,
                            }}
                        >
                            {tag.emoji} {tag.name}
                        </button>
                    ))}
                </div>
            </header>

            {selectedPost ? (
                <ThreadView
                    post={selectedPost}
                    replies={repliesFromTimeline}
                    onBack={() => setSelectedPostId(null)}
                    onReply={sendThread}
                />
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    {filteredAndSorted.map((post) => (
                        <ForumPost
                            key={post.eventId}
                            roomId={roomId}
                            post={post}
                            member={memberMap.get(post.authorId)}
                            onOpen={setSelectedPostId}
                        />
                    ))}
                    {!posts.loading && filteredAndSorted.length === 0 ? (
                        <div
                            style={{
                                color: 'var(--text-secondary)',
                                textAlign: 'center',
                                padding: 16,
                            }}
                        >
                            No forum posts yet.
                        </div>
                    ) : null}
                </div>
            )}
        </section>
    );
};

export default ForumView;
