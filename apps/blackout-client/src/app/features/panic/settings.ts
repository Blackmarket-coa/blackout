import type { FeatureSettingsItem } from '../../core/features/types';
import { PanicSettings } from './PanicSettings';
import { ActiveDefenseSettings } from './ActiveDefenseSettings';

/**
 * Panic / duress controls (OSS-manifest group G5). Personal panic-wipe is a
 * free safety baseline; the active-defense (canary / decoy) section is an
 * enterprise/Sovereignty-tier capability gated behind the `activeDefense`
 * flag. Only defensive, local primitives ship — see the ethics note in
 * `docs/oss_manifest_packaging.md`.
 */
export const panicWipeSettings: FeatureSettingsItem[] = [
    {
        section: 'Safety / Panic',
        component: PanicSettings,
    },
];

export const activeDefenseSettings: FeatureSettingsItem[] = [
    {
        section: 'Safety / Active defense',
        component: ActiveDefenseSettings,
    },
];
