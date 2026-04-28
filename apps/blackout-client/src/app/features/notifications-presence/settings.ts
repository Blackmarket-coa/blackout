import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const buildPlaceholderSection = (title: string, body: string) =>
    function NotificationsSettingsSection() {
        return createElement(
            'section',
            { style: { padding: 12 } },
            createElement('h2', null, title),
            createElement('p', null, body)
        );
    };

/**
 * Settings sections introduced for BKL-004 — notifications rules + presence
 * digest preferences. Placeholders pending the canonical settings shell
 * rewire (deferred alongside BKL-001/BKL-002).
 */
export const notificationRulesSettings: FeatureSettingsItem[] = [
    {
        section: 'Notifications / Rules',
        component: buildPlaceholderSection(
            'Notifications · Rules',
            'Per-feature notification rules: hard-cap per day, cooldown, and quiet-hours window. Backed by `fetchNotificationRules` / `upsertNotificationRule` SDK actions.'
        ),
    },
];

export const presenceDigestSettings: FeatureSettingsItem[] = [
    {
        section: 'Notifications / Presence digest',
        component: buildPlaceholderSection(
            'Notifications · Presence digest',
            'Window length, digest mode (live vs batched), and acknowledgement cadence. Backed by `fetchPresenceDigest` / `acknowledgePresenceDigest`.'
        ),
    },
];
