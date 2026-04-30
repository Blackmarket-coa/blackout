import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const buildSection = (title: string, body: string) =>
    function AuthThreadsSettingsSection() {
        return createElement(
            'section',
            { style: { padding: 12 } },
            createElement('h2', null, title),
            createElement('p', null, body)
        );
    };

export const authOidcSettings: FeatureSettingsItem[] = [
    {
        section: 'Auth / Delegated login',
        component: buildSection(
            'Auth · Delegated login',
            'OIDC issuer URL + redirect handling. Backed by `beginOidcLogin` / `continueOidcSession` and the `blackout.auth.session.continued` envelope.'
        ),
    },
];

export const threadActivitySettings: FeatureSettingsItem[] = [
    {
        section: 'Inbox / Thread activity',
        component: buildSection(
            'Inbox · Thread activity',
            'Activity inbox window, mark-read cadence, and unread badge sources. Backed by `listActivity` / `markActivityRead` and the `blackout.thread.activity.updated` envelope.'
        ),
    },
];
