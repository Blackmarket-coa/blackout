import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';

const PresenceDigestRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Presence Digest'),
        createElement(
            'p',
            null,
            'Inbox-style presence digest placeholder. Backed by `fetchPresenceDigest` / `acknowledgePresenceDigest` SDK actions and `blackout.notifications.digest.*` events.'
        )
    );

export const presenceDigestRoutes: FeatureRoute[] = [
    { path: '/notifications/presence-digest', component: PresenceDigestRoutePage },
];
