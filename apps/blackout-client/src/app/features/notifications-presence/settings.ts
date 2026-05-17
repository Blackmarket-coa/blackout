import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';
import { NotificationRulesEditor } from './NotificationRulesEditor';

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
 * Notification rules settings section — BKL-004 Port 3. Renders the real
 * `NotificationRulesEditor` (form + list + optimistic CRUD) backed by
 * `fetchNotificationRules` / `upsertNotificationRule` /
 * `deleteNotificationRule` SDK actions.
 */
export const notificationRulesSettings: FeatureSettingsItem[] = [
    {
        section: 'Notifications / Rules',
        component: NotificationRulesEditor,
    },
];

/**
 * Presence digest preferences placeholder. The route at
 * `/notifications/presence-digest` already renders the real
 * `PresenceDigestPage` (window length + ack). A dedicated settings section
 * for digest cadence is deferred alongside BKL-001/BKL-002 settings shell
 * rewire.
 */
export const presenceDigestSettings: FeatureSettingsItem[] = [
    {
        section: 'Notifications / Presence digest',
        component: buildPlaceholderSection(
            'Notifications · Presence digest',
            'Window length, digest mode (live vs batched), and acknowledgement cadence. Backed by `fetchPresenceDigest` / `acknowledgePresenceDigest`.'
        ),
    },
];
