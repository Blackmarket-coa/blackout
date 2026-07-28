import type { ColiseumTabId } from '@blackout/core';

/**
 * Client-side presentation split of the Coliseum tabs: a TikTok-slim strip of
 * primary destinations plus a "More" sheet for the specialist surfaces. This
 * is purely presentational — tab ids, per-den `enabledTabs` gating, and stored
 * tab state all keep using the full 10-id taxonomy.
 */
export const PRIMARY_COLISEUM_TABS: readonly ColiseumTabId[] = [
    'reel',
    'topics',
    'knowledge',
    'live',
    'challenges',
];

export const SECONDARY_COLISEUM_TABS: readonly ColiseumTabId[] = [
    'arena',
    'match',
    'shouts',
    'leaderboards',
    'sources',
];

export interface ColiseumTabSplit {
    /** Tabs rendered directly on the strip. */
    primary: ColiseumTabId[];
    /** Tabs tucked into the "More" sheet. */
    secondary: ColiseumTabId[];
}

/**
 * Split the enabled tabs into strip vs sheet. `debate` is never a strip
 * destination — it's a drill-in reached from a topic or a reel argument. If a
 * den enables only specialist tabs, the first few are promoted to the strip so
 * the surface never renders an empty tab bar.
 */
export function splitColiseumTabs(enabled: readonly ColiseumTabId[]): ColiseumTabSplit {
    // Annotated: TS would otherwise infer a type predicate that excludes
    // 'debate' from the element type and reject `.includes` below.
    const selectable: ColiseumTabId[] = enabled.filter((tab) => tab !== 'debate');
    const primary = PRIMARY_COLISEUM_TABS.filter((tab) => selectable.includes(tab));
    const secondary = selectable.filter((tab) => !PRIMARY_COLISEUM_TABS.includes(tab));
    if (primary.length === 0) {
        return {
            primary: secondary.slice(0, PRIMARY_COLISEUM_TABS.length),
            secondary: secondary.slice(PRIMARY_COLISEUM_TABS.length),
        };
    }
    return { primary, secondary };
}
