import { coalitionFeature } from '../../features/coalition';
import { coliseumFeature } from '../../features/coliseum';
import { deaddropFeature } from '../../features/deaddrop';
import { forumFeature } from '../../features/forum';
import { governanceFeature } from '../../features/governance';
import { mediaCallFeature } from '../../features/media-call';
import { moderationFeature } from '../../features/moderation';
import { monetizationFeature } from '../../features/monetization';
import { notificationsPresenceFeature } from '../../features/notifications-presence';
import { platformOpsFeature } from '../../features/platform-ops';
import { authThreadsFeature } from '../../features/auth-threads';
import { educationFeature } from '../../features/education';
import { federatedOpsFeature } from '../../features/federated-ops';
import { settingsParityFeature } from '../../features/settings-parity';
import { stegoToolkitFeature } from '../../features/stego-toolkit';
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
    {
        feature: mediaCallFeature,
        flag: 'mediaCall',
    },
    {
        feature: stegoToolkitFeature,
        flag: 'stegoToolkit',
    },
    {
        feature: settingsParityFeature,
        flag: 'settingsParity',
    },
    {
        feature: federatedOpsFeature,
        flag: 'federatedOps',
    },
    {
        feature: authThreadsFeature,
        flag: 'authThreads',
    },
    {
        feature: educationFeature,
        flag: 'education',
    },
    {
        feature: coalitionFeature,
        flag: 'coalition',
    },
    {
        feature: coliseumFeature,
        flag: 'coliseum',
    },
];
