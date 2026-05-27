import React, { type ReactNode } from 'react';
import type { ColiseumTabId } from '@blackout/core';

/**
 * One-line, migrant-friendly explainers for each Coliseum tab. Rendered in a
 * lingering {@link FeatureGuide} strip so newcomers always know what a tab does
 * and how to take part.
 */
export const COLISEUM_TAB_GUIDES: Record<ColiseumTabId, ReactNode> = {
    topics: (
        <>
            Debates anchored to a news story. Open one to join in, or tap{' '}
            <strong>+ New topic</strong> to start your own.
        </>
    ),
    debate: (
        <>
            Post arguments (For / Against / Nuance), cite sources, vote, and reply.{' '}
            <strong>Post argument</strong> to add yours.
        </>
    ),
    reel: <>A vertical feed of the strongest arguments across every debate — swipe to browse.</>,
    live: <>Real-time town halls. Join, request to speak, and follow the pinned evidence.</>,
    sources: <>Curated news and feeds you can cite to back up your arguments.</>,
};
