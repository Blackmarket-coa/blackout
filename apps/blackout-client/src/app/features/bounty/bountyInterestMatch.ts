import { type BountyCategory } from '@blackout/core';

/**
 * Map the viewer's onboarding interest tags (freeform topic slugs stored in
 * Matrix account data `co.bmc.discovery.interests.v1`) onto bounty categories so
 * the Creator Hub can bias recommended bounties toward stated interests.
 *
 * Deliberately small and explicit — only obvious tag→category mappings are
 * listed; any tag not present here is ignored rather than guessed. Keys are
 * lowercase, `#`-stripped tag slugs.
 */
const TAG_TO_BOUNTY_CATEGORY: Readonly<Record<string, BountyCategory>> = {
    creator: 'creator',
    creators: 'creator',
    streaming: 'creator',
    streamer: 'creator',
    streamers: 'creator',
    coalition: 'coalition',
    coalitions: 'coalition',
    community: 'coalition',
    organizing: 'coalition',
    activism: 'coalition',
    'mutual-aid': 'coalition',
    developer: 'developer',
    developers: 'developer',
    dev: 'developer',
    coding: 'developer',
    programming: 'developer',
    opensource: 'developer',
    'open-source': 'developer',
    tester: 'tester',
    testers: 'tester',
    testing: 'tester',
    qa: 'tester',
    content: 'content',
    'content-creation': 'content',
    writing: 'content',
    video: 'content',
    art: 'content',
    music: 'content',
    design: 'content',
};

/** Normalize a raw tag to its lookup key: trimmed, lowercased, leading `#` removed. */
const normalizeTag = (tag: string): string => tag.trim().toLowerCase().replace(/^#+/, '');

/**
 * Derive the distinct bounty categories implied by a set of interest tags,
 * preserving BOUNTY category priority order. Unmapped tags are silently dropped.
 */
export const interestTagsToBountyCategories = (tags: Iterable<string>): BountyCategory[] => {
    const matched = new Set<BountyCategory>();
    for (const tag of tags) {
        const category = TAG_TO_BOUNTY_CATEGORY[normalizeTag(tag)];
        if (category) matched.add(category);
    }
    return [...matched];
};

export const __test__ = { TAG_TO_BOUNTY_CATEGORY, normalizeTag };
