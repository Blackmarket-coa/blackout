import type { FeedSort } from './unifiedFeedModel';

export type HomeFeedSegment = 'forYou' | 'following';

export type HomeFeedTelemetryEvent =
    | { name: 'home_segment_switched'; segment: HomeFeedSegment }
    | { name: 'home_sort_changed'; sort: FeedSort };

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
