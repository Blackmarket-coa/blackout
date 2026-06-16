import type { BlackoutFeature } from '../../core/features/types';
import {
    growthAmbassadorNavItems,
    growthQuestsNavItems,
    growthReferralsNavItems,
} from './nav';
import {
    growthAmbassadorRoutes,
    growthQuestsRoutes,
    growthReferralsRoutes,
} from './routes';

/**
 * Growth-engine surfaces. The backend ledger (`packages/api/src/services/
 * growth.ts`) and client wrappers (`growthClient.ts`) shipped first; these three
 * features register the UI. Split into three features — one per flag
 * (`growthReferrals` / `growthAmbassadors` / `growthQuests`) — so the registry
 * composer's single-flag-per-module gate lets each surface toggle independently,
 * mirroring the `creators` split. All gate on the shared `growth.read` capability.
 */
const GROWTH_CAPABILITIES = ['growth.read', 'growth.write'];

export const growthReferralsFeature: BlackoutFeature = {
    id: 'growth-referrals',
    name: 'Growth · Referrals',
    customizations: [
        {
            id: 'growth-referrals-dashboard',
            name: 'Referrals dashboard',
            category: 'service-backed plugin',
            capabilityGate: { allOf: ['growth.read'], flags: ['growthReferrals'] },
            routes: growthReferralsRoutes,
            navItems: growthReferralsNavItems,
        },
    ],
    capabilities: GROWTH_CAPABILITIES,
};

export const growthAmbassadorsFeature: BlackoutFeature = {
    id: 'growth-ambassadors',
    name: 'Growth · Ambassadors',
    customizations: [
        {
            id: 'growth-ambassador-application',
            name: 'Ambassador application',
            category: 'workflow plugin',
            capabilityGate: { allOf: ['growth.read'], flags: ['growthAmbassadors'] },
            routes: growthAmbassadorRoutes,
            navItems: growthAmbassadorNavItems,
        },
    ],
    capabilities: GROWTH_CAPABILITIES,
};

export const growthQuestsFeature: BlackoutFeature = {
    id: 'growth-quests',
    name: 'Growth · Quests',
    customizations: [
        {
            id: 'growth-quests-board',
            name: 'Quests',
            category: 'service-backed plugin',
            capabilityGate: { allOf: ['growth.read'], flags: ['growthQuests'] },
            routes: growthQuestsRoutes,
            navItems: growthQuestsNavItems,
        },
    ],
    capabilities: GROWTH_CAPABILITIES,
};
