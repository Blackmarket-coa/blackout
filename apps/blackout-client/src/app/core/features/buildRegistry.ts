import { deaddropFeature } from '../../features/deaddrop';
import { forumFeature } from '../../features/forum';
import { governanceFeature } from '../../features/governance';
import type { BlackoutFeature } from './types';
import type { FeatureFlags } from './featureFlags';

export const buildFeatureRegistry = (flags: FeatureFlags): BlackoutFeature[] =>
    [
        flags.governance ? governanceFeature : null,
        flags.forum ? forumFeature : null,
        flags.deaddrop ? deaddropFeature : null,
    ].filter((feature): feature is BlackoutFeature => feature !== null);
