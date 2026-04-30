import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const buildPlaceholderSection = (title: string, body: string) =>
    function SettingsParitySection() {
        return createElement(
            'section',
            { style: { padding: 12 } },
            createElement('h2', null, title),
            createElement('p', null, body)
        );
    };

/**
 * Settings sections introduced for BKL-007 — preferences / sidebar / labs
 * tab parity with `_port`. Placeholders pending the canonical settings IA
 * rewire (the same rewire BKL-008's tab depends on for navigation).
 */
export const preferencesSettings: FeatureSettingsItem[] = [
    {
        section: 'Preferences',
        component: buildPlaceholderSection(
            'Preferences',
            'Language, autocomplete delay, read-marker thresholds, timezone. Backed by `fetchBucket` / `setSetting` (category `preferences`, scope `device` or `account`).'
        ),
    },
];

export const sidebarSettings: FeatureSettingsItem[] = [
    {
        section: 'Sidebar',
        component: buildPlaceholderSection(
            'Sidebar',
            'Meta-space toggles (Home/Favourites/People/Orphans/VideoRooms). Backed by `fetchBucket` / `setSetting` (category `sidebar`, scope `account`).'
        ),
    },
];

export const labsSettings: FeatureSettingsItem[] = [
    {
        section: 'Labs',
        component: buildPlaceholderSection(
            'Labs',
            'Experimental + beta feature toggles, gated by `legacy.config.labs_gate`. Backed by `fetchLabsFeatures` / `setLabsFeatureEnabled` / `fetchLabsGate` and `resolveLabsGate`.'
        ),
    },
];
