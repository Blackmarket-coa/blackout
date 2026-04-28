import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';

const PlatformOpsDashboard = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Platform Operations'),
        createElement(
            'p',
            null,
            'Operations dashboard placeholder. Surfaces will be wired through the registry as they land.'
        )
    );

const PlatformOpsAdminConsole = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Platform Ops Admin Console'),
        createElement(
            'p',
            null,
            'Admin-only operations console. Access requires the `platform-ops.admin` capability.'
        )
    );

export const platformOpsRoutes: FeatureRoute[] = [
    { path: '/ops/platform', component: PlatformOpsDashboard },
];

export const platformOpsAdminRoutes: FeatureRoute[] = [
    { path: '/ops/platform/admin', component: PlatformOpsAdminConsole },
];
