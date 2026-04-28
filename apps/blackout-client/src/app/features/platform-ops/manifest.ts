import type { BlackoutFeature } from '../../core/features/types';
import { platformOpsAdminNavItems, platformOpsNavItems } from './nav';
import { platformOpsAdminPanels, platformOpsPanels } from './panels';
import { platformOpsAdminRoutes, platformOpsRoutes } from './routes';
import { platformOpsAdminSettings, platformOpsSettings } from './settings';

/**
 * Platform Ops feature module — BKL-002.
 *
 * Contributes operations IA (routes/nav/panels/settings) and an admin-only
 * customization gated by `platform-ops.admin`. The admin customization is
 * marked `adminEntry: true` so the canonical sidebar can drive its
 * "show admin entry" gate from the manifest instead of the ad-hoc
 * `showAdminEntry` boolean used in apps/blackout-web.
 */
export const platformOpsFeature: BlackoutFeature = {
    id: 'platform-ops',
    name: 'Platform Ops',
    customizations: [
        {
            id: 'platform-ops-base',
            name: 'Platform Ops Base',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['platform-ops.read'],
                flags: ['platformOps'],
            },
            routes: platformOpsRoutes,
            navItems: platformOpsNavItems,
            settings: platformOpsSettings,
            panels: platformOpsPanels,
        },
        {
            id: 'platform-ops-admin',
            name: 'Platform Ops Admin Console',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['platform-ops.admin'],
                flags: ['platformOps'],
            },
            routes: platformOpsAdminRoutes,
            navItems: platformOpsAdminNavItems,
            settings: platformOpsAdminSettings,
            panels: platformOpsAdminPanels,
            adminEntry: true,
        },
    ],
    capabilities: ['platform-ops.read', 'platform-ops.admin'],
};
