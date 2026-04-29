import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const buildPlaceholderSection = (title: string, body: string) =>
    function PlatformOpsSettingsSection() {
        return createElement(
            'section',
            { style: { padding: 12 } },
            createElement('h2', null, title),
            createElement('p', null, body)
        );
    };

/**
 * Mirrors the blackout-web settings IA `workspace|appearance|monetization|
 * mobile|operations` operations slot. Renders are placeholders until the
 * canonical settings shell is rewired to consume FeatureSettingsItem[]
 * (deferred to follow-up BKL items).
 */
export const platformOpsSettings: FeatureSettingsItem[] = [
    {
        section: 'Operations',
        component: buildPlaceholderSection(
            'Operations',
            'Platform-level operations preferences. Controls runtime caches, feature kill switches, and rollout cohorts.'
        ),
    },
    {
        section: 'Operations / Mobile',
        component: buildPlaceholderSection(
            'Operations · Mobile',
            'Mobile push gateway, deep-link prefixes, and wrapper diagnostics.'
        ),
    },
];

export const platformOpsAdminSettings: FeatureSettingsItem[] = [
    {
        section: 'Operations / Admin Console',
        component: buildPlaceholderSection(
            'Operations · Admin Console',
            'Admin-only operations console. Requires the `platform-ops.admin` capability.'
        ),
    },
];
