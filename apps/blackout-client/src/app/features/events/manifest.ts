import type { BlackoutFeature } from '../../core/features/types';
import { eventsRoutes } from './routes';

/**
 * Events surface — `/events` directory + `/events/:roomId/:eventId`
 * detail. Powered entirely by `co.bmc.event` Matrix state events
 * inside joined canopies/dens and `m.reaction` events for RSVPs;
 * no new server storage. PR 6 ships read-only surfaces; the
 * "create event" + first-class RSVP picker land in a follow-up.
 */
export const eventsFeature: BlackoutFeature = {
    id: 'events',
    name: 'Events',
    customizations: [
        {
            id: 'events-v1',
            name: 'Events directory + detail',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['eventsV1'],
            },
            routes: eventsRoutes,
        },
    ],
    capabilities: ['events.read'],
};
