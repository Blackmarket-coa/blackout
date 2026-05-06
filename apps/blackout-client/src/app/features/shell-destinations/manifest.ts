import type { BlackoutFeature } from '../../core/features/types';
import { shellDestinationPanels } from './panels';

/**
 * Registers the five canonical AppShell destinations as registry
 * mobile-tab panels. Gated by the `shellAppShell` flag so the rollout
 * is reversible — when the flag is off, BottomTabBar finds zero entries
 * and renders nothing.
 *
 * This feature deliberately registers only panels (no routes, no
 * navItems) because the destination bodies are owned by their feature
 * managers (CommunitiesView, MessagingHub, MarketplaceSlice, etc.) or
 * by the legacy ClientLayout for the Home (`/`) destination. Subsequent
 * PRs wire any missing route bodies (PR 2 = HomeFeed, PR 3 = MarketShell).
 */
export const shellDestinationsFeature: BlackoutFeature = {
    id: 'shell-destinations',
    name: 'AppShell Destinations',
    customizations: [
        {
            id: 'shell-destinations.tabs',
            name: 'AppShell tabs',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['shellAppShell'],
            },
            panels: shellDestinationPanels,
        },
    ],
};
