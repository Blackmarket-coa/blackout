import type { BlackoutFeature } from '../../core/features/types';
import { onboardingCreatorRoutes } from './routes';

/**
 * PR 7 — creator-onboarding fork mounted at `/onboarding/creator`.
 * Lives as its own feature so it can ship reversibly behind
 * `onboardingCreatorPath` without disturbing the existing
 * space-driven `OnboardingFlow` machine. The migration-credit form
 * is gated separately by `onboardingMigrationCredits` at runtime.
 */
export const onboardingCreatorFeature: BlackoutFeature = {
    id: 'onboarding-creator',
    name: 'Creator onboarding',
    customizations: [
        {
            id: 'onboarding-creator.flow',
            name: 'Creator onboarding flow',
            category: 'workflow plugin',
            capabilityGate: {
                flags: ['onboardingCreatorPath'],
            },
            routes: onboardingCreatorRoutes,
        },
    ],
    capabilities: ['monetization.write'],
};
