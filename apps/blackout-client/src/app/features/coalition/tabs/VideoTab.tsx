import React, { useMemo } from 'react';
import { useCoalitionFeed, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';

export interface VideoTabProps {
    scope: CoalitionScopeQuery;
}

export function VideoTab({ scope }: VideoTabProps) {
    const { data, loading, error } = useCoalitionFeed(scope, { kind: 'video', limit: 20 });
    const items = useMemo(() => data?.items ?? [], [data]);

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
            }}
            data-testid="coalition-video-reel"
        >
            {items.map((item) => (
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
                        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 13 }}>
                            <span>♡ Like</span>
                            <span>💬 Comment</span>
                            <span>↗ Share</span>
                        </div>
                    </div>
                </article>
            ))}
        </div>
    );
}

export default VideoTab;
