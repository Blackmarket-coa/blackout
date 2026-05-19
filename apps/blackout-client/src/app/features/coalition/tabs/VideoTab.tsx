import React, { useCallback, useMemo, useState } from 'react';
import { useCoalitionFeed, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import { buildCommunitiesPath } from '../../../pages/paths';

export interface VideoTabProps {
    scope: CoalitionScopeQuery;
}

export function VideoTab({ scope }: VideoTabProps) {
    const { data, loading, error } = useCoalitionFeed(scope, { kind: 'video', limit: 20 });
    const items = useMemo(() => data?.items ?? [], [data]);
    const [liked, setLiked] = useState<Record<string, boolean>>({});
    const [commenting, setCommenting] = useState<string | null>(null);
    const [shareStatus, setShareStatus] = useState<string | null>(null);

    const toggleLike = useCallback((id: string) => {
        setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

    const onShare = useCallback(async (id: string, title: string) => {
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

    if (loading && items.length === 0) {
        return <div style={{ padding: 24 }}>Loading For You feed...</div>;
    }
    if (error) {
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    }
    if (items.length === 0) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                No videos yet. Be the first to post.
            </div>
        );
    }

    return (
        <div
            style={{
                height: 'min(72vh, 820px)',
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
            {items.map((item) => {
                const isLiked = !!liked[item.id];
                const isCommenting = commenting === item.id;
                return (
                    <article
                        key={item.id}
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
                                    background:
                                        'linear-gradient(180deg, #1ABC9C 0%, #0d1f14 100%)',
                                }}
                            />
                        )}
                        <div
                            style={{
                                position: 'relative',
                                padding: '24px 16px',
                                width: '100%',
                                background:
                                    'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
                            }}
                        >
                            <div style={{ fontSize: 14, opacity: 0.8 }}>
                                {item.authorId ?? 'Coalition'}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                                {item.title}
                            </div>
                            {item.body ? (
                                <div style={{ fontSize: 14, marginTop: 4, opacity: 0.9 }}>
                                    {item.body}
                                </div>
                            ) : null}
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button
                                    type="button"
                                    onClick={() => toggleLike(item.id)}
                                    aria-pressed={isLiked}
                                    aria-label={isLiked ? 'Unlike' : 'Like'}
                                    data-testid={`coalition-video-like-${item.id}`}
                                    style={reelButtonStyle(isLiked)}
                                >
                                    {isLiked ? '♥ Liked' : '♡ Like'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCommenting((prev) => (prev === item.id ? null : item.id))
                                    }
                                    aria-expanded={isCommenting}
                                    aria-label="Comment"
                                    data-testid={`coalition-video-comment-${item.id}`}
                                    style={reelButtonStyle(isCommenting)}
                                >
                                    💬 Comment
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
                                    {item.denId ? (
                                        <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>
                                            Comments live in the linked den.{' '}
                                            <a
                                                href={buildCommunitiesPath(null, item.denId)}
                                                style={{ color: '#1ABC9C' }}
                                            >
                                                Open conversation →
                                            </a>
                                        </p>
                                    ) : (
                                        <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>
                                            This video isn't linked to a den yet, so comments
                                            aren't available.
                                        </p>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

function reelButtonStyle(active: boolean): React.CSSProperties {
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

export default VideoTab;
