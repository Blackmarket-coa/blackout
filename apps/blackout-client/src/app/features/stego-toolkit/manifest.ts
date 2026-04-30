import type { BlackoutFeature } from '../../core/features/types';
import {
    ephemeralStegoLifecyclePanels,
    stegoToolkitPanels,
} from './panels';
import {
    ephemeralStegoLifecycleRoutes,
    stegoToolkitRoutes,
} from './routes';
import {
    ephemeralStegoLifecycleSettings,
    stegoToolkitSettings,
} from './settings';

/**
 * Stego toolkit + ephemeral lifecycle feature module — BKL-005.
 *
 * Two customizations gated by separate capabilities so admins can grant the
 * toolkit (compose / list channels) without granting the ephemeral lifecycle
 * controls (rotate / expire), and vice versa. Both ride behind the
 * `stegoToolkit` flag so the default canonical shell stays unchanged until
 * operators opt in.
 *
 * Mirrors the `stego_toolkit` + `ephemeral_stego_lifecycle` entries in
 * `apps/blackout-web/src/settings/feature-entrypoints.ts`.
 */
export const stegoToolkitFeature: BlackoutFeature = {
    id: 'stego-toolkit',
    name: 'Stego Toolkit',
    customizations: [
        {
            id: 'stego-toolkit',
            name: 'Stego Toolkit',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['stego.toolkit.use'],
                flags: ['stegoToolkit'],
            },
            routes: stegoToolkitRoutes,
            panels: stegoToolkitPanels,
            settings: stegoToolkitSettings,
        },
        {
            id: 'ephemeral-stego-lifecycle',
            name: 'Ephemeral Stego Lifecycle',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['stego.lifecycle.manage'],
                flags: ['stegoToolkit'],
            },
            routes: ephemeralStegoLifecycleRoutes,
            panels: ephemeralStegoLifecyclePanels,
            settings: ephemeralStegoLifecycleSettings,
        },
    ],
    capabilities: [
        'stego.toolkit.use',
        'stego.lifecycle.manage',
    ],
};
