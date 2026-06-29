import React, { useCallback, useState } from 'react';
import type { CoalitionFeedItem } from '@blackout/core';
import { useCoalitionVideoEngagement } from '../hooks/useCoalitionFeed';
import { buildCommunitiesPath } from '../../../pages/paths';
import { ProjectSupportCard } from './ProjectSupportCard';

export type ShareHandler = (id: string, title: string) => void | Promise<void>;

/**
 * Build a share handler for coalition videos. Uses the Web Share API when
 * available, falling back to clipboard, surfacing a transient status string.
 * Shared by the (map) reel overlay and any reel container.
 */
export function useVideoShare(): { shareStatus: string | null; onShare: ShareHandler } {
    const [shareStatus, setShareStatus] = useState<string | null>(null);
    const onShare = useCallback<ShareHandler>(async (id, title) => {
        const url = `${window.location.origin}/coalition/video/${encodeURIComponent(id)}`;
        try {
            if (navigator.share) {
                await navigator.share({ title, url });
                setShareStatus('Shared');
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(url);
                setShareStatus('Link copied');
            } else {
                setShareStatus('Share unsupported');
            }
        } catch {
            setShareStatus('Share cancelled');
        }
        window.setTimeout(() => setShareStatus(null), 1500);
    }, []);
    return { shareStatus, onShare };
}

export interface VideoReelProps {
    items: CoalitionFeedItem[];
    onShare: ShareHandler;
    shareStatus?: string | null;
    /** Height of the scroll-snap container; defaults to the standalone reel sizing. */
    height?: number | string;
}

/**
 * Vertical, scroll-snap reel of coalition videos (TikTok/Snapchat style). Each
 * item owns its like/comment state. Reused by the standalone feed and by the
 * map's tap-to-play story overlay.
 */
export function VideoReel({
    items,
    onShare,
    shareStatus,
    height = 'min(72vh, 820px)',
}: VideoReelProps) {
    return (
        <div
            style={{
                height,
                overflowY: 'auto',
                scrollSnapType: 'y mandatory',
                background: '#000',
                position: 'relative',
            }}
            data-testid="coalition-video-reel"
        >
            {shareStatus ? (
                <div
                    role="status"
                    style={{
                        position: 'absolute',
                        top: 12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.7)',
                        color: '#fff',
                        padding: '6px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        zIndex: 2,
                    }}
                >
                    {shareStatus}
                </div>
            ) : null}
            {items.map((item) => (
                <VideoReelItem key={item.id} item={item} onShare={onShare} />
            ))}
        </div>
    );
}

interface VideoReelItemProps {
    item: CoalitionFeedItem;
    onShare: ShareHandler;
}

/**
 * A single reel item. Each item owns its like/comment state via the engagement
 * hook — extracted into its own component so the hook is called once per item
 * rather than inside a `.map()` (rules-of-hooks).
 */
export function VideoReelItem({ item, onShare }: VideoReelItemProps) {
    const { likes, comments, toggleLike, addComment } = useCoalitionVideoEngagement(item.id);
    const [isCommenting, setIsCommenting] = useState(false);
    const [draft, setDraft] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const likedByMe = likes.data?.likedByMe ?? false;
    const likeCount = likes.data?.count ?? 0;
    const commentList = comments.data?.comments ?? [];

    const onToggleLike = useCallback(() => {
        void toggleLike(!likedByMe);
    }, [toggleLike, likedByMe]);

    const onSubmitComment = useCallback(async () => {
        const body = draft.trim();
        if (!body || submitting) return;
        setSubmitting(true);
        try {
            await addComment(body);
            setDraft('');
        } finally {
            setSubmitting(false);
        }
    }, [draft, submitting, addComment]);

    return (
        <article
            style={{
                scrollSnapAlign: 'start',
                height: '100%',
                minHeight: 360,
                position: 'relative',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                background: '#0a0a0a',
                color: '#fff',
            }}
        >
            {item.mediaUrl ? (
                <video
                    src={item.mediaUrl}
                    playsInline
                    muted
                    loop
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            ) : (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(180deg, #1ABC9C 0%, #0d1f14 100%)',
                    }}
                />
            )}
            <div
                style={{
                    position: 'relative',
                    padding: '24px 16px',
                    width: '100%',
                    background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
                }}
            >
                <div style={{ fontSize: 14, opacity: 0.8 }}>{item.authorId ?? 'Coalition'}</div>
                <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{item.title}</div>
                {item.body ? (
                    <div style={{ fontSize: 14, marginTop: 4, opacity: 0.9 }}>{item.body}</div>
                ) : null}
                {item.projectId ? <ProjectSupportCard projectId={item.projectId} /> : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                        type="button"
                        onClick={onToggleLike}
                        aria-pressed={likedByMe}
                        aria-label={likedByMe ? 'Unlike' : 'Like'}
                        data-testid={`coalition-video-like-${item.id}`}
                        style={reelButtonStyle(likedByMe)}
                    >
                        {likedByMe ? '♥' : '♡'} {likeCount > 0 ? likeCount : 'Like'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCommenting((prev) => !prev)}
                        aria-expanded={isCommenting}
                        aria-label="Comment"
                        data-testid={`coalition-video-comment-${item.id}`}
                        style={reelButtonStyle(isCommenting)}
                    >
                        💬 {commentList.length > 0 ? commentList.length : 'Comment'}
                    </button>
                    <button
                        type="button"
                        onClick={() => void onShare(item.id, item.title)}
                        aria-label="Share"
                        data-testid={`coalition-video-share-${item.id}`}
                        style={reelButtonStyle(false)}
                    >
                        ↗ Share
                    </button>
                    {item.denId ? (
                        <a
                            href={buildCommunitiesPath(null, item.denId)}
                            style={{
                                ...reelButtonStyle(false),
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                            }}
                        >
                            Open den →
                        </a>
                    ) : null}
                </div>
                {isCommenting ? (
                    <div
                        style={{
                            marginTop: 10,
                            background: 'rgba(0,0,0,0.45)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 10,
                            padding: 8,
                        }}
                    >
                        <div style={{ display: 'flex', gap: 8 }}>
                            <textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Add a comment…"
                                rows={2}
                                data-testid={`coalition-video-comment-input-${item.id}`}
                                style={{
                                    flex: 1,
                                    resize: 'vertical',
                                    borderRadius: 8,
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(0,0,0,0.4)',
                                    color: '#fff',
                                    padding: 8,
                                    fontSize: 13,
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => void onSubmitComment()}
                                disabled={submitting || draft.trim().length === 0}
                                data-testid={`coalition-video-comment-submit-${item.id}`}
                                style={{
                                    ...reelButtonStyle(false),
                                    alignSelf: 'flex-start',
                                    opacity: submitting || draft.trim().length === 0 ? 0.5 : 1,
                                }}
                            >
                                Post
                            </button>
                        </div>
                        {comments.error ? (
                            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger)' }}>
                                Couldn't load comments: {comments.error}
                            </p>
                        ) : null}
                        <ul
                            data-testid={`coalition-video-comment-list-${item.id}`}
                            style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}
                        >
                            {commentList.map((comment) => (
                                <li
                                    key={comment.id}
                                    style={{
                                        padding: '6px 0',
                                        borderTop: '1px solid rgba(255,255,255,0.08)',
                                        fontSize: 13,
                                    }}
                                >
                                    <span style={{ opacity: 0.7 }}>{comment.authorId}</span>{' '}
                                    {comment.body}
                                </li>
                            ))}
                            {commentList.length === 0 && !comments.loading ? (
                                <li style={{ padding: '6px 0', fontSize: 12, opacity: 0.7 }}>
                                    No comments yet — start the conversation.
                                </li>
                            ) : null}
                        </ul>
                        {item.denId ? (
                            <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.7 }}>
                                <a
                                    href={buildCommunitiesPath(null, item.denId)}
                                    style={{ color: '#1ABC9C' }}
                                >
                                    Continue in the den →
                                </a>
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </article>
    );
}

export function reelButtonStyle(active: boolean): React.CSSProperties {
    return {
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 999,
        padding: '6px 12px',
        background: active ? 'rgba(26,188,156,0.25)' : 'rgba(0,0,0,0.35)',
        color: '#fff',
        fontSize: 13,
        cursor: 'pointer',
    };
}
