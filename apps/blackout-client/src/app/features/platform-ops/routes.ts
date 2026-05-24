import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';
import { PlatformOpsAdminConsole } from './PlatformOpsAdminConsole';

const PlatformOpsDashboard = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Platform Operations'),
        createElement(
            'p',
            null,
            'Operations landing. Admin-only server operations live under the Operations Admin console.'
        )
    );

export const platformOpsRoutes: FeatureRoute[] = [
    { path: '/ops/platform', component: PlatformOpsDashboard },
];

export const platformOpsAdminRoutes: FeatureRoute[] = [
    { path: '/ops/platform/admin', component: PlatformOpsAdminConsole },
];
