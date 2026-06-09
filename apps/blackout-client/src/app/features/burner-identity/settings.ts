import type { FeatureSettingsItem } from '../../core/features/types';
import { BurnerIdentitiesPanel } from './BurnerIdentitiesPanel';

/**
 * Settings section for the OSS-manifest persona engine (group G3). A single
 * burner identity is free; the persona roster + alias rotation managed here
 * are a `pro`-tier quota (see
 * `packages/blackout-protocol/src/persona/entitlements.ts`).
 */
export const personaEngineSettings: FeatureSettingsItem[] = [
    {
        section: 'Identity / Personas',
        component: BurnerIdentitiesPanel,
    },
];
