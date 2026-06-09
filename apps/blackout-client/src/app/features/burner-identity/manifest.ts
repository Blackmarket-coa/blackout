import type { BlackoutFeature } from '../../core/features/types';
import { personaEngineSettings } from './settings';

/**
 * Burner-identity feature module — anchors OSS-manifest group G3 (Personas /
 * Identity). See `docs/oss_manifest_packaging.md` for the free/tiered/plugin
 * classification.
 *
 * One customization, `persona-engine`, gated by `persona.roster.manage`
 * behind the `personaEngine` flag. The single free burner identity is a
 * baseline primitive; managing a roster of compartmentalized personas is a
 * `pro`-tier quota (`PERSONA_QUOTAS.maxPersonas`).
 */
export const burnerIdentityFeature: BlackoutFeature = {
    id: 'burner-identity',
    name: 'Burner Identity',
    customizations: [
        {
            id: 'persona-engine',
            name: 'Persona Engine',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['persona.roster.manage'],
                flags: ['personaEngine'],
            },
            settings: personaEngineSettings,
        },
    ],
    capabilities: ['persona.roster.manage'],
};
