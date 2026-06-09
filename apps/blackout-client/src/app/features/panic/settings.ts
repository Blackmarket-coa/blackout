import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';
import { PanicSettings } from './PanicSettings';

const buildPlaceholderSection = (title: string, body: string) =>
    function ActiveDefenseSettingsSection() {
        return createElement(
            'section',
            { style: { padding: 12 } },
            createElement('h2', null, title),
            createElement('p', null, body)
        );
    };

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
        component: buildPlaceholderSection(
            'Active defense · Canaries',
            'Deploy canary tokens and decoy data to detect unauthorized access. Defensive and local only; no offensive or third-party-directed behavior ships. Gated to the enterprise tier with explicit admin consent.'
        ),
    },
];
