import { deaddropFeature } from '../../features/deaddrop';
import { forumFeature } from '../../features/forum';
import { governanceFeature } from '../../features/governance';
import { moderationFeature } from '../../features/moderation';
import { monetizationFeature } from '../../features/monetization';
import { notificationsPresenceFeature } from '../../features/notifications-presence';
import { platformOpsFeature } from '../../features/platform-ops';
import type { FeatureModule } from './types';

export const coreFeatureModules: FeatureModule[] = [
    {
        feature: governanceFeature,
        flag: 'governance',
    },
    {
        feature: forumFeature,
        flag: 'forum',
    },
    {
        feature: deaddropFeature,
        flag: 'deaddrop',
    },
    {
        feature: moderationFeature,
        flag: 'moderation',
    },
    {
        feature: monetizationFeature,
        flag: 'monetization',
    },
    {
        feature: platformOpsFeature,
        flag: 'platformOps',
    },
    {
        feature: notificationsPresenceFeature,
        flag: 'notificationsPresence',
    },
];
