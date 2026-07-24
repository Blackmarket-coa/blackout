import React, { type ReactNode } from 'react';
import type { StreamingTabId } from '../../state/streaming';

/**
 * One-line, migrant-friendly explainers for each Creator Hub tab. Rendered in
 * a lingering {@link FeatureGuide} strip so newcomers always know what a tab
 * does and how to take part — same pattern as the Coalition and Coliseum tab
 * guides.
 */
export const STREAMING_TAB_GUIDES: Record<StreamingTabId, ReactNode> = {
    overview: (
        <>
            Your creator dashboard. Draft and publish content, post bounties, and jump into any
            surface of the hub from here.
        </>
    ),
    content: (
        <>
            Everything you&apos;ve made in one place — <strong>Live</strong> streams happening now,{' '}
            <strong>Replays</strong> of past streams, and <strong>Clips</strong> cut from them.
        </>
    ),
    kits: <>Ready-made bundles that set up your creator surfaces in one tap.</>,
    earnings: (
        <>
            Money in one place — <strong>Rewards</strong> from tips and subscriptions, your
            marketplace <strong>Listings</strong>, and revenue <strong>Splits</strong> with
            collaborators.
        </>
    ),
    integrations: (
        <>
            Connect Twitch, YouTube, Kick, and Discord — broadcast settings, linked accounts, chat
            bridges and webhooks, and the health of each connection.
        </>
    ),
};
