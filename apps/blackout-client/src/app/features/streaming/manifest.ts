import type { BlackoutFeature } from '../../core/features/types';
import { streamingNavItems } from './nav';
import { streamingPanels } from './panels';
import { streamingRoutes } from './routes';

/**
 * Creator Hub (`/streaming`, rebranded; also reachable via the
 * `/creator-hub` alias). Routed like coalition/coliseum: a top-level
 * destination with an internal tab strip. Acts as the creator operating
 * system — an Overview that deep-links the creator's surfaces (storefront,
 * earnings, coalitions, events), the live + replay + clip directories,
 * creator kits, a rewards dashboard, plus the platform-connection
 * management UIs (linked accounts, RTMP simulcast, OBS-WS, chat bridges,
 * webhooks, widget alerts, integrations health).
 */
export const streamingFeature: BlackoutFeature = {
    id: 'streaming',
    name: 'Creator Hub',
    customizations: [
        {
            id: 'streaming-shell',
            name: 'Creator Hub Shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['streaming'],
            },
            routes: streamingRoutes,
            navItems: streamingNavItems,
            panels: streamingPanels,
        },
    ],
    capabilities: ['streaming.read', 'streaming.write'],
};
