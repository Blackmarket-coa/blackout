import type { BlackoutFeature } from '../../core/features/types';
import { communityAssetNavItems } from './nav';
import { communityAssetPanels } from './panels';
import { communityAssetRoutes } from './routes';

export const communityAssetsFeature: BlackoutFeature = {
    id: 'community-assets',
    name: 'Community Assets',
    customizations: [
        {
            id: 'community-assets-shell',
            name: 'Community Assets Shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['communityAssets'],
            },
            routes: communityAssetRoutes,
            navItems: communityAssetNavItems,
            panels: communityAssetPanels,
        },
    ],
    capabilities: ['assets.read', 'assets.write'],
};
