import React, { useMemo } from 'react';
import {
    useCoalitionFeed,
    type CoalitionScopeQuery,
} from '../hooks/useCoalitionFeed';
import { VideoReel, useVideoShare } from './VideoReel';

export interface VideoTabProps {
    scope: CoalitionScopeQuery;
}

/**
 * Standalone "For You" reel. Coalition is map-first, so this is no longer one of
 * the Coalition tabs — videos surface as pins on the map. The component is
 * retained for the `/coalition/video/:id` deep-link and reuses the shared
 * {@link VideoReel}.
 */
export function VideoTab({ scope }: VideoTabProps) {
    const { data, loading, error } = useCoalitionFeed(scope, { kind: 'video', limit: 20 });
    const items = useMemo(() => data?.items ?? [], [data]);
    const { shareStatus, onShare } = useVideoShare();

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

    return <VideoReel items={items} onShare={onShare} shareStatus={shareStatus} />;
}

export default VideoTab;
