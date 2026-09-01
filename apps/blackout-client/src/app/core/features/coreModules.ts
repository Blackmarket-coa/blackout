import { canopyFeature } from '../../features/canopy';
import { coalitionFeature } from '../../features/coalition';
import { circleFeedFeature } from '../../features/circle-feed';
import { coliseumFeature } from '../../features/coliseum';
import { communitiesFeature } from '../../features/communities';
import {
    creatorsFeature,
    creatorsStorefrontFeature,
    creatorsDashboardFeature,
} from '../../features/creators';
import { deaddropFeature } from '../../features/deaddrop';
import { deadmanFeature } from '../../features/deadman';
import { marketFeature } from '../../features/market';
import { createFeature } from '../../features/create';
import { migrationHubFeature } from '../../features/migration-hub';
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
import { federationSelfHostFeature } from '../../features/federation-selfhost';
import { onboardingCreatorFeature } from '../../features/onboarding-creator';
import { federatedOpsFeature } from '../../features/federated-ops';
import { settingsParityFeature } from '../../features/settings-parity';
import { shellDestinationsFeature } from '../../features/shell-destinations';
import { stegoToolkitFeature } from '../../features/stego-toolkit';
import { streamsFeature } from '../../features/streams';
import { streamingFeature } from '../../features/streaming';
import { topicsFeature } from '../../features/topics';
import {
    growthReferralsFeature,
    growthAmbassadorsFeature,
    growthQuestsFeature,
} from '../../features/growth';
import { privacyToolsFeature } from '../../features/privacy-tools';
import { burnerIdentityFeature } from '../../features/burner-identity';
import { panicFeature } from '../../features/panic';
import { meshFeature } from '../../features/mesh';
import { messagingFeature } from '../../features/messaging';
import type { FeatureModule } from './types';

export const coreFeatureModules: FeatureModule[] = [
    {
        feature: communitiesFeature,
        flag: 'communities',
    },
    {
        feature: canopyFeature,
        flag: 'canopyServer',
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
        feature: circleFeedFeature,
        flag: 'circleFeed',
    },
    {
        feature: migrationHubFeature,
        flag: 'migrationHub',
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
        feature: growthReferralsFeature,
        flag: 'growthReferrals',
    },
    {
        feature: growthAmbassadorsFeature,
        flag: 'growthAmbassadors',
    },
    {
        feature: growthQuestsFeature,
        flag: 'growthQuests',
    },
    {
        feature: marketFeature,
        flag: 'marketTab',
    },
    {
        feature: createFeature,
        flag: 'createHub',
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
        feature: streamingFeature,
        flag: 'streaming',
    },
    {
        feature: eventsFeature,
        flag: 'eventsV1',
    },
    {
        feature: onboardingCreatorFeature,
        flag: 'onboardingCreatorPath',
    },
    {
        feature: creatorsDashboardFeature,
        flag: 'creatorsDashboard',
    },
    {
        feature: federationSelfHostFeature,
        flag: 'federationSelfHost',
    },
    {
        // OSS-manifest G1/G2. `shieldVisibility` is the privacy-tools module
        // switch; the privacy-hardening customization is further gated by
        // `privacyHardening` within the module (pro-tier surface).
        feature: privacyToolsFeature,
        flag: 'shieldVisibility',
    },
    {
        feature: burnerIdentityFeature,
        flag: 'personaEngine',
    },
    {
        // OSS-manifest G5. `activeDefense` is the panic/active-defense module
        // switch; `panic-wipe` is the free tier inside it, while the
        // `active-defense` (canary/decoy) customization carries its own gate.
        feature: panicFeature,
        flag: 'activeDefense',
    },
    {
        // OSS-manifest G6. `meshTransport` switches the store-and-forward
        // mesh module; the `mesh-transport` customization is enterprise-gated.
        feature: meshFeature,
        flag: 'meshTransport',
    },
    {
        feature: messagingFeature,
        flag: 'messaging',
    },
];
