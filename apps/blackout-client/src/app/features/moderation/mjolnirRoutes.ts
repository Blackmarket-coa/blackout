import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';

const MjolnirSettingsRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Mjolnir Moderation'),
        createElement(
            'p',
            null,
            'Personal banlists, subscribed lists, and protection toggles. Backed by `listBanLists` / `addBanListRule` / `listProtections` / `setProtectionEnabled` SDK actions and `blackout.moderation.mjolnir.{protection,banlist}.changed` events.'
        )
    );

export const mjolnirSettingsRoutes: FeatureRoute[] = [
    { path: '/settings/moderation/mjolnir', component: MjolnirSettingsRoutePage },
];
