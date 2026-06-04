import { useEffect, useState } from 'react';
import type { CreatorContent } from '@blackout/core';
import { fetchHomeContentFeed } from '../../creators/contentClient';

export interface CreatorContentFeedState {
    content: CreatorContent[];
    loading: boolean;
}

/**
 * Standalone home-feed source for recently published creator content. Kept
 * isolated from `useUnifiedFeed` (like `useBountyBoard`) so a content-API outage
 * degrades to an empty rail without touching the main feed — a rejected fetch is
 * swallowed to `[]`. Issues no request and returns `[]` when `enabled` is false,
 * so the rail ships dark behind its feature flag.
 */
export function useCreatorContentFeed(enabled: boolean): CreatorContentFeedState {
    const [content, setContent] = useState<CreatorContent[]>([]);
    const [loading, setLoading] = useState(enabled);

    useEffect(() => {
        if (!enabled) {
            setContent([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetchHomeContentFeed()
            .then((res) => {
                if (!cancelled) setContent(res.content);
            })
            .catch(() => {
                if (!cancelled) setContent([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return { content, loading };
}
