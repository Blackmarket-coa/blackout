import React, { useMemo, useState } from 'react';
import { useCoalitionFeed, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import { VideoReel, useVideoShare } from './VideoReel';
import { VideoComposer } from '../composer/VideoComposer';

export interface VideoTabProps {
    scope: CoalitionScopeQuery;
}

/**
 * Standalone "For You" reel. Coalition is map-first, so this is no longer one of
 * the Coalition tabs — videos surface as pins on the map. The component is
 * retained for the `/coalition/video/:id` deep-link and reuses the shared
 * {@link VideoReel}. It also hosts the record-and-post {@link VideoComposer},
 * so the reel is a creation surface, not just playback.
 */
export function VideoTab({ scope }: VideoTabProps) {
    const { data, loading, error, refetch } = useCoalitionFeed(scope, {
        kind: 'video',
        limit: 20,
    });
    const items = useMemo(() => data?.items ?? [], [data]);
    const { shareStatus, onShare } = useVideoShare();
    const [composing, setComposing] = useState(false);

    const body = () => {
        if (loading && items.length === 0) {
            return <div style={{ padding: 24 }}>Loading For You feed...</div>;
        }
        if (error) {
            return (
                <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>
            );
        }
        if (items.length === 0) {
            return (
                <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                    No videos yet. Be the first to post.
                </div>
            );
        }
        return <VideoReel items={items} onShare={onShare} shareStatus={shareStatus} />;
    };

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
                <button
                    type="button"
                    onClick={() => setComposing((prev) => !prev)}
                    aria-expanded={composing}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 999,
                        border: '1px solid var(--border-default, #374151)',
                        background: composing ? 'transparent' : 'var(--bg-accent, #2563eb)',
                        color: composing ? 'inherit' : 'var(--text-on-accent, #fff)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                    data-testid="coalition-video-create"
                >
                    {composing ? 'Close composer' : '+ Create'}
                </button>
            </div>
            {composing ? (
                <VideoComposer
                    scope={scope}
                    onPosted={() => {
                        setComposing(false);
                        refetch();
                    }}
                    onClose={() => setComposing(false)}
                />
            ) : null}
            {body()}
        </div>
    );
}

export default VideoTab;
