import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const buildSection = (title: string, body: string) =>
    function FederatedOpsSettingsSection() {
        return createElement(
            'section',
            { style: { padding: 12 } },
            createElement('h2', null, title),
            createElement('p', null, body)
        );
    };

export const federationHealthSettings: FeatureSettingsItem[] = [
    {
        section: 'Ops / Federation health',
        component: buildSection(
            'Ops · Federation health',
            'Notification thresholds + remote homeserver allowlist for federation alerts. Backed by `listAlerts` / `acknowledgeAlert` and the `blackout.federation.alert.status` envelope.'
        ),
    },
];

export const townhallSettings: FeatureSettingsItem[] = [
    {
        section: 'Ops / Townhall',
        component: buildSection(
            'Ops · Townhall',
            'Townhall scheduling defaults + lifecycle notifications. Backed by `listTownhalls` / `transitionTownhall` and the `blackout.townhall.lifecycle` envelope.'
        ),
    },
];

export const revenueOpsSettings: FeatureSettingsItem[] = [
    {
        section: 'Ops / Revenue',
        component: buildSection(
            'Ops · Revenue',
            'Snapshot publication cadence + currency formatting. Backed by `getRevenueSnapshot` / `listRevenueSnapshots` / `publishRevenueSnapshot` and the `blackout.revenue.ops.snapshot` envelope.'
        ),
    },
];
