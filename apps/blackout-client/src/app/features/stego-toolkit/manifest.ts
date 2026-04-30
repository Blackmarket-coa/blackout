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
    stegoSettingsTabSettings,
    stegoToolkitSettings,
} from './settings';

/**
 * Stego toolkit + ephemeral lifecycle feature module — BKL-005, with the
 * dedicated steganography settings tab (BKL-008) folded in as a third
 * capability-gated customization.
 *
 * Three customizations:
 *   - `stego-toolkit`            gated by `stego.toolkit.use`
 *   - `ephemeral-stego-lifecycle` gated by `stego.lifecycle.manage`
 *   - `stego-settings-tab`       gated by `stego.settings.read` (BKL-008)
 *
 * All three ride behind the `stegoToolkit` flag so the default canonical
 * shell stays unchanged until operators opt in.
 *
 * Mirrors the `stego_toolkit` + `ephemeral_stego_lifecycle` entries in
 * `apps/blackout-web/src/settings/feature-entrypoints.ts` plus the
 * `port.settings.steganography` parity row.
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
        {
            id: 'stego-settings-tab',
            name: 'Steganography Settings Tab',
            category: 'visual/layout plugin',
            capabilityGate: {
                allOf: ['stego.settings.read'],
                flags: ['stegoToolkit'],
            },
            settings: stegoSettingsTabSettings,
        },
    ],
    capabilities: [
        'stego.toolkit.use',
        'stego.lifecycle.manage',
        'stego.settings.read',
    ],
};
