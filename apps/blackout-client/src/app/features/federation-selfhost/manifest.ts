import type { BlackoutFeature } from '../../core/features/types';
import { federationSelfHostRoutes } from './routes';

/**
 * PR 8 — `/federation/self-host` wizard. Pure client-side template
 * generator that produces a per-canopy `docker-compose.yml` blueprint
 * (Synapse + Postgres + matrix-media-repo + optional Owncast). No
 * server endpoints; the page is a glorified static-form-to-yaml
 * compiler that mirrors `infra/docker-compose.yml`.
 */
export const federationSelfHostFeature: BlackoutFeature = {
    id: 'federation-self-host',
    name: 'Federation self-host wizard',
    customizations: [
        {
            id: 'federation-self-host.wizard',
            name: 'Self-host wizard',
            category: 'workflow plugin',
            capabilityGate: {
                flags: ['federationSelfHost'],
            },
            routes: federationSelfHostRoutes,
        },
    ],
    capabilities: ['federation.read'],
};
