import type { BlackoutFeature } from '../../core/features/types';
import {
    federationHealthPanels,
    revenueOpsPanels,
    townhallPanels,
} from './panels';
import {
    federationHealthRoutes,
    revenueOpsRoutes,
    townhallRoutes,
} from './routes';
import {
    federationHealthSettings,
    revenueOpsSettings,
    townhallSettings,
} from './settings';

/**
 * Federated ops feature module — BKL-010.
 *
 * Three customizations gated by separate capabilities so admins can grant
 * federation health without granting townhall control or revenue access:
 *   - `federation-health` gated by `federation.health.read`
 *   - `townhall-ops`      gated by `townhall.ops.manage`
 *   - `revenue-ops`       gated by `revenue.ops.read`
 *
 * All three ride behind the `federatedOps` flag so the canonical shell
 * stays unchanged until operators opt in.
 *
 * Mirrors the `web.panel.federation`, `web.panel.townhall`, and
 * `web.panel.revenue_ops` rows from the parity matrix.
 */
export const federatedOpsFeature: BlackoutFeature = {
    id: 'federated-ops',
    name: 'Federated Ops',
    customizations: [
        {
            id: 'federation-health',
            name: 'Federation Health',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['federation.health.read'],
                flags: ['federatedOps'],
            },
            routes: federationHealthRoutes,
            panels: federationHealthPanels,
            settings: federationHealthSettings,
        },
        {
            id: 'townhall-ops',
            name: 'Townhall Ops',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['townhall.ops.manage'],
                flags: ['federatedOps'],
            },
            routes: townhallRoutes,
            panels: townhallPanels,
            settings: townhallSettings,
        },
        {
            id: 'revenue-ops',
            name: 'Revenue Ops',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['revenue.ops.read'],
                flags: ['federatedOps'],
            },
            routes: revenueOpsRoutes,
            panels: revenueOpsPanels,
            settings: revenueOpsSettings,
        },
    ],
    capabilities: [
        'federation.health.read',
        'townhall.ops.manage',
        'revenue.ops.read',
    ],
};
