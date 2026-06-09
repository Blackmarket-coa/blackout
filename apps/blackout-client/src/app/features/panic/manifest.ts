import type { BlackoutFeature } from '../../core/features/types';
import { activeDefenseSettings, panicWipeSettings } from './settings';

/**
 * Panic & active-defense feature module — anchors OSS-manifest group G5
 * (Active Defense). See `docs/oss_manifest_packaging.md` for the
 * free/tiered/plugin classification.
 *
 * Two customizations:
 *   - `panic-wipe`      free personal-safety baseline; gated only by
 *                       `panic.wipe.trigger` (no feature flag).
 *   - `active-defense`  enterprise/Sovereignty-tier deception primitives
 *                       (canary tokens, decoy data); gated by
 *                       `defense.canary.deploy` behind the `activeDefense`
 *                       flag. Defensive/local only — never default-on.
 */
export const panicFeature: BlackoutFeature = {
    id: 'panic',
    name: 'Panic & Active Defense',
    customizations: [
        {
            id: 'panic-wipe',
            name: 'Panic Wipe',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['panic.wipe.trigger'],
            },
            settings: panicWipeSettings,
        },
        {
            id: 'active-defense',
            name: 'Active Defense',
            category: 'service-backed plugin',
            adminEntry: true,
            capabilityGate: {
                allOf: ['defense.canary.deploy'],
                flags: ['activeDefense'],
            },
            settings: activeDefenseSettings,
        },
    ],
    capabilities: ['panic.wipe.trigger', 'defense.canary.deploy'],
};
