import { coalitionFeature } from '../../features/coalition';
import { coliseumFeature } from '../../features/coliseum';
import { communitiesFeature } from '../../features/communities';
import { creatorsFeature, creatorsStorefrontFeature } from '../../features/creators';
import { deaddropFeature } from '../../features/deaddrop';
import { deadmanFeature } from '../../features/deadman';
import { marketFeature } from '../../features/market';
import { pluginsFeature } from '../../features/plugins';
import { profileFeature } from '../../features/profile';
import { forumFeature } from '../../features/forum';
import { governanceFeature } from '../../features/governance';
import { mediaCallFeature } from '../../features/media-call';
import { moderationFeature } from '../../features/moderation';
import { monetizationFeature } from '../../features/monetization';
import { notificationsPresenceFeature } from '../../features/notifications-presence';
import { platformOpsFeature } from '../../features/platform-ops';
import { authThreadsFeature } from '../../features/auth-threads';
import { educationFeature } from '../../features/education';
import { eventsFeature } from '../../features/events';
import { onboardingCreatorFeature } from '../../features/onboarding-creator';
import { federatedOpsFeature } from '../../features/federated-ops';
import { settingsParityFeature } from '../../features/settings-parity';
import { shellDestinationsFeature } from '../../features/shell-destinations';
import { stegoToolkitFeature } from '../../features/stego-toolkit';
import { streamsFeature } from '../../features/streams';
import { topicsFeature } from '../../features/topics';
import type { FeatureModule } from './types';

export const coreFeatureModules: FeatureModule[] = [
    {
        feature: communitiesFeature,
        flag: 'communities',
    },
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
        feature: deadmanFeature,
        flag: 'deadman',
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
    {
        feature: profileFeature,
        flag: 'profile',
    },
    {
        feature: pluginsFeature,
        flag: 'plugins',
    },
    {
        feature: shellDestinationsFeature,
        flag: 'shellAppShell',
    },
    {
        feature: topicsFeature,
        flag: 'topics',
    },
    {
        feature: marketFeature,
        flag: 'marketTab',
    },
    {
        feature: creatorsFeature,
        flag: 'creatorsListings',
    },
    {
        feature: creatorsStorefrontFeature,
        flag: 'creatorsStorefront',
    },
    {
        feature: streamsFeature,
        flag: 'streamsViewer',
    },
    {
        feature: eventsFeature,
        flag: 'eventsV1',
    },
    {
        feature: onboardingCreatorFeature,
        flag: 'onboardingCreatorPath',
    },
];
