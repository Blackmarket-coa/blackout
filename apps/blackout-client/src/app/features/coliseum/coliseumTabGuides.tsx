import React, { type ReactNode } from 'react';
import type { ColiseumTabId } from '@blackout/core';

/**
 * One-line, migrant-friendly explainers for each Coliseum tab. Rendered in a
 * lingering {@link FeatureGuide} strip so newcomers always know what a tab does
 * and how to take part.
 */
export const COLISEUM_TAB_GUIDES: Record<ColiseumTabId, ReactNode> = {
    arena: (
        <>
            The match arena. Issue a <strong>Callout</strong>, accept a challenge, and fight in
            structured video rounds. Every match ends in a verdict and a permanent Brief.
        </>
    ),
    match: (
        <>
            The match you're watching — fighter cards, video rounds, the crowd's round votes, the
            Crucible, and the final Brief.
        </>
    ),
    shouts: (
        <>
            Raw, unstructured video takes. Drop a response on any Shout; if a back-and-forth forms,
            it can graduate into a full Match.
        </>
    ),
    topics: (
        <>
            Debates anchored to a news story. Tap a topic to open its debate, or tap the{' '}
            <strong>+</strong> button to start a new one.
        </>
    ),
    debate: (
        <>
            Vote on arguments and fire back with rebuttals. Tap <strong>Make your case…</strong> at
            the bottom to post your own argument — For, Against, or Nuance.
        </>
    ),
    reel: (
        <>
            <strong>For You</strong> — a vertical feed of the strongest arguments. Swipe up for the
            next one; double-tap or swipe right to agree, swipe left to disagree.
        </>
    ),
    live: <>Real-time town halls. Join, request to speak, and follow the pinned evidence.</>,
    challenges: (
        <>
            Community challenges — start a business, grow food, build a project. Enter your attempt
            and vote on others; the top entries rise to the top.
        </>
    ),
    leaderboards: (
        <>
            Who's leading across the ecosystem — creators, coalitions, projects, and challenges,
            ranked by activity.
        </>
    ),
    sources: <>Curated news and feeds you can cite to back up your arguments.</>,
};
