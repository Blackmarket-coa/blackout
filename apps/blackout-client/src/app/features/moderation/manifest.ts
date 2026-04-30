import type { BlackoutFeature } from '../../core/features/types';
import { mjolnirSettingsPanels } from './mjolnirPanels';
import { mjolnirSettingsRoutes } from './mjolnirRoutes';
import { mjolnirSettingsItems } from './mjolnirSettings';
import { moderationNavItems } from './nav';
import { moderationRoutes } from './routes';

export const moderationFeature: BlackoutFeature = {
    id: 'moderation',
    name: 'Moderation',
    customizations: [
        {
            id: 'draupnir-console',
            name: 'Draupnir Console',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['moderation.read'],
                flags: ['moderation'],
            },
            routes: moderationRoutes,
            navItems: moderationNavItems,
        },
        {
            id: 'mjolnir-settings',
            name: 'Mjolnir Moderation',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['moderation.mjolnir.manage'],
                flags: ['moderation'],
            },
            routes: mjolnirSettingsRoutes,
            panels: mjolnirSettingsPanels,
            settings: mjolnirSettingsItems,
        },
    ],
    capabilities: [
        'moderation.read',
        'moderation.write',
        'moderation.mjolnir.manage',
    ],
};
