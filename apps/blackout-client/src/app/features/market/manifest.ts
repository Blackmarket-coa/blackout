import type { BlackoutFeature } from '../../core/features/types';
import { marketRoutes } from './routes';
import { marketDestinationPanels } from './panels';

/**
 * Market destination — `/market`. Hoists the existing
 * `MarketplaceSlice` (`features/monetization/marketplace`) into the
 * AppShell as a top-level "Community Market" destination.
 *
 * Gated solely by `marketTab` (default on). It is intentionally NOT chained
 * to the legacy `monetizationMarketplace` flag: that flag is a monetization
 * *slice* flag, forced off at runtime whenever the `monetization` master is
 * off (see validateMonetizationSkuDependencies), and only gates the embedded
 * monetization-panel marketplace. The top-level destination stands alone.
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
                flags: ['marketTab'],
            },
            routes: marketRoutes,
        },
        {
            // Primary-nav destination. Also gated on `shellAppShell` so the tab
            // never appears as a lone entry when the AppShell bars are off.
            id: 'market-destination',
            name: 'Market destination',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['shellAppShell', 'marketTab'],
            },
            panels: marketDestinationPanels,
        },
    ],
    capabilities: ['monetization.read'],
};
