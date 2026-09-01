import type { FeedSort } from './unifiedFeedModel';

/**
 * `circle` is the Circle & Reach feed — only what people chose to relay, in
 * time order. `forYou` and `following` are the ranked aggregator, which now
 * lives behind Discover.
 */
export type HomeFeedSegment = 'circle' | 'forYou' | 'following';

export type HomeFeedTelemetryEvent =
    | { name: 'home_segment_switched'; segment: HomeFeedSegment }
    | { name: 'home_sort_changed'; sort: FeedSort }
    | { name: 'home_streak_incremented'; count: number };

/**
 * Emits on the shared `blackout:telemetry` CustomEvent channel (same channel
 * onboarding telemetry uses), so dashboards can subscribe in one place. No
 * persistence — these are high-frequency UI interactions.
 */
const emit = (event: HomeFeedTelemetryEvent) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('blackout:telemetry', { detail: event }));
};

export const trackHomeSegmentSwitched = (segment: HomeFeedSegment) => {
    emit({ name: 'home_segment_switched', segment });
};

export const trackHomeSortChanged = (sort: FeedSort) => {
    emit({ name: 'home_sort_changed', sort });
};

export const trackHomeStreakIncremented = (count: number) => {
    emit({ name: 'home_streak_incremented', count });
};
