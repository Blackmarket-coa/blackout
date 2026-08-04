import type { ColiseumTabId } from '@blackout/core';

/**
 * Client-side presentation split of the Coliseum tabs.
 *
 * The strip carries exactly the surfaces that are *not* about one topic. The
 * test is simple: is the entity topic-keyed?
 *
 * - `debate` and `sources` were always topic-scoped.
 * - `live` is keyed by `ColiseumLiveSession.topicId`.
 * - `match` and `arena` hang off `ColiseumMatch.propositionTopicId`.
 * - `shouts` is a topic proposed with a `media` seed.
 *
 * All of those are sections of `TopicPage`. What remains is genuinely
 * cross-topic: the feed itself, the reel, the archive, the rankings — plus
 * `challenges`, which is the one surface here with no topic to hang off
 * (`ColiseumChallenge` has no `topicId`; it is a parallel entity, not a child).
 *
 * This is purely presentational. Tab ids, per-den `enabledTabs` gating, and
 * stored tab state all keep using the full 11-id taxonomy so a persisted value
 * or an old link never throws.
 */
export const PRIMARY_COLISEUM_TABS: readonly ColiseumTabId[] = [
    'topics',
    'reel',
    'knowledge',
    'challenges',
    'leaderboards',
];

/**
 * Reachable only by drilling into a topic. Never rendered on the strip and
 * never in an overflow sheet — there is no overflow sheet any more, which is
 * the point of the consolidation.
 */
export const TOPIC_SECTION_COLISEUM_TABS: readonly ColiseumTabId[] = [
    'debate',
    'arena',
    'match',
    'shouts',
    'sources',
    'live',
];

/**
 * @deprecated The "More" sheet is gone. Retained as an empty list so any
 * caller still reading it keeps compiling.
 */
export const SECONDARY_COLISEUM_TABS: readonly ColiseumTabId[] = [];

export interface ColiseumTabSplit {
    /** Tabs rendered directly on the strip. */
    primary: ColiseumTabId[];
    /** Always empty: specialist surfaces now live inside a topic. */
    secondary: ColiseumTabId[];
}

/**
 * Split the enabled tabs into strip vs drill-in. If a den enables only
 * topic-section tabs, the topics feed is promoted so the surface never renders
 * an empty tab bar.
 */
export function splitColiseumTabs(enabled: readonly ColiseumTabId[]): ColiseumTabSplit {
    const selectable = enabled.filter((tab) => !TOPIC_SECTION_COLISEUM_TABS.includes(tab));
    const primary = PRIMARY_COLISEUM_TABS.filter((tab) => selectable.includes(tab));
    if (primary.length === 0) {
        return { primary: ['topics'], secondary: [] };
    }
    return { primary, secondary: [] };
}
