import type { BlackoutFeature } from '../../core/features/types';
import { marketRoutes } from './routes';

/**
 * Market destination — `/market`. Hoists the existing
 * `MarketplaceSlice` (`features/monetization/marketplace`) into the
 * AppShell as a top-level destination instead of an embedded panel.
 *
 * Gated by both `marketTab` (the hoist toggle, default off) and
 * `monetizationMarketplace` (the legacy gate on the underlying buyer
 * surface). Either flag off keeps the slice rendering only inside
 * the legacy monetization panel.
 */
export const marketFeature: BlackoutFeature = {
    id: 'market',
    name: 'Market',
    customizations: [
        {
            id: 'market-shell',
            name: 'Market shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['marketTab', 'monetizationMarketplace'],
            },
            routes: marketRoutes,
        },
    ],
    capabilities: ['monetization.read'],
};
