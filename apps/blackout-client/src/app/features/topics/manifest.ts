import type { BlackoutFeature } from '../../core/features/types';
import { topicsRoutes } from './routes';

/**
 * Topics surface — `/topics` and `/topics/:tag`. Driven by the existing
 * DiscoveryService tag index; the feature exists so the routes are
 * deep-linkable and capability-gated like every other registry-mounted
 * surface. No mobile-tab panel: topics surface through chips inside
 * HomeFeed and DiscoverySurface, not as a top-level destination.
 */
export const topicsFeature: BlackoutFeature = {
    id: 'topics',
    name: 'Topics',
    customizations: [
        {
            id: 'topics-detail',
            name: 'Topic detail pages',
            category: 'visual/layout plugin',
            capabilityGate: {
                allOf: ['discovery.read'],
                flags: ['topics'],
            },
            routes: topicsRoutes,
        },
    ],
    capabilities: ['discovery.read'],
};
