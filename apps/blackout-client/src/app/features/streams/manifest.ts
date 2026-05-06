import type { BlackoutFeature } from '../../core/features/types';
import { streamsRoutes } from './routes';

/**
 * Streams surface — `/live` directory + `/live/:streamId` viewer.
 * Reads the existing `/v1/streaming/*` API (extended in PR 4 with a
 * list endpoint and single-stream endpoint). The Matrix-overlay chat,
 * subscriber-side LiveKit token issuance, and product-shelf rendering
 * are deferred to a follow-up PR — `co.bmc.product_attachments`
 * events on the stream's den (PR 3) drop straight in once a stream→
 * den association is added on the server `StreamRecord`.
 */
export const streamsFeature: BlackoutFeature = {
    id: 'streams',
    name: 'Streams',
    customizations: [
        {
            id: 'streams-viewer',
            name: 'Livestream viewer',
            category: 'visual/layout plugin',
            capabilityGate: {
                allOf: ['streaming.read'],
                flags: ['streamsViewer'],
            },
            routes: streamsRoutes,
        },
    ],
    capabilities: ['streaming.read'],
};
