import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const buildPlaceholderSection = (title: string, body: string) =>
    function GovernanceSettingsSection() {
        return createElement(
            'section',
            { style: { padding: 12 } },
            createElement('h2', null, title),
            createElement('p', null, body)
        );
    };

/**
 * Governance settings sections introduced for BKL-003 scheduler + treasury
 * parity. Kept as placeholders pending the canonical settings shell rewire.
 */
export const governanceMeetingsSettings: FeatureSettingsItem[] = [
    {
        section: 'Governance / Meetings',
        component: buildPlaceholderSection(
            'Governance · Meetings',
            'Defaults for meeting scheduling: time-zone, default duration, and reminder cadence.'
        ),
    },
];

export const governanceTreasurySettings: FeatureSettingsItem[] = [
    {
        section: 'Governance / Treasury',
        component: buildPlaceholderSection(
            'Governance · Treasury',
            'Treasury snapshot preferences: refresh cadence, fiat reference currency, and visibility scope.'
        ),
    },
];
