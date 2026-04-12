import { deaddropFeature } from '../../features/deaddrop';
import { forumFeature } from '../../features/forum';
import { governanceFeature } from '../../features/governance';
import { moderationFeature } from '../../features/moderation';
import type { FeatureModule } from './types';

export const coreFeatureModules: FeatureModule[] = [
    {
        feature: governanceFeature,
        flag: 'governance',
        source: 'core',
    },
    {
        feature: forumFeature,
        flag: 'forum',
        source: 'core',
    },
    {
        feature: deaddropFeature,
        flag: 'deaddrop',
        source: 'core',
    },
    {
        feature: moderationFeature,
        flag: 'moderation',
        source: 'core',
    },
];
