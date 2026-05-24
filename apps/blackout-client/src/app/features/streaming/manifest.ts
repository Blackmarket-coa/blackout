import type { BlackoutFeature } from '../../core/features/types';
import { streamingNavItems } from './nav';
import { streamingPanels } from './panels';
import { streamingRoutes } from './routes';

/**
 * Consolidated Streaming hub (`/streaming`). Routed like coalition/coliseum:
 * a top-level destination with an internal tab strip. Surfaces the streaming
 * viewer plus the platform-connection management UIs (linked accounts, RTMP
 * simulcast, OBS-WS, chat bridges, webhooks, widget alerts, integrations
 * health) that were previously built but unreachable from the active settings
 * shell.
 */
export const streamingFeature: BlackoutFeature = {
    id: 'streaming',
    name: 'Streaming',
    customizations: [
        {
            id: 'streaming-shell',
            name: 'Streaming Shell',
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
