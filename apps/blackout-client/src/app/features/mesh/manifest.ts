import type { BlackoutFeature } from '../../core/features/types';
import { meshTransportSettings } from './settings';

/**
 * Mesh / offline-transport feature module — anchors OSS-manifest group G6.
 * See `docs/oss_manifest_packaging.md` for the free/tiered/plugin
 * classification.
 *
 * Registered behind the `meshTransport` flag (see `coreModules.ts`). The single
 * `mesh-transport` customization is an enterprise/Sovereignty-tier capability
 * gated by `mesh.peer.sync`. First-party greenfield store-and-forward — no
 * Briar/Bramble code ships (GPLv3, reference-only; manifest §4).
 */
export const meshFeature: BlackoutFeature = {
    id: 'mesh',
    name: 'Mesh / Offline Transport',
    customizations: [
        {
            id: 'mesh-transport',
            name: 'Mesh · Offline transport',
            category: 'service-backed plugin',
            adminEntry: true,
            capabilityGate: {
                allOf: ['mesh.peer.sync'],
                flags: ['meshTransport'],
            },
            settings: meshTransportSettings,
        },
    ],
    capabilities: ['mesh.peer.sync'],
};
