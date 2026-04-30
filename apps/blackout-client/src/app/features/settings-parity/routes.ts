import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';

const PreferencesRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Preferences'),
        createElement(
            'p',
            null,
            'Language, autocomplete delay, read-marker thresholds, timezone. Backed by `fetchBucket` / `setSetting` (category `preferences`).'
        )
    );

const SidebarRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Sidebar'),
        createElement(
            'p',
            null,
            'Meta-space toggles (Home/Favourites/People/Orphans/VideoRooms). Backed by `fetchBucket` / `setSetting` (category `sidebar`).'
        )
    );

const LabsRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Labs'),
        createElement(
            'p',
            null,
            'Experimental features. Visible only when the labs gate (`legacy.config.labs_gate` OR per-user developerMode) resolves visible. Backed by `fetchLabsFeatures` / `setLabsFeatureEnabled` / `fetchLabsGate`.'
        )
    );

export const preferencesRoutes: FeatureRoute[] = [
    { path: '/settings/preferences', component: PreferencesRoutePage },
];

export const sidebarRoutes: FeatureRoute[] = [
    { path: '/settings/sidebar', component: SidebarRoutePage },
];

export const labsRoutes: FeatureRoute[] = [
    { path: '/settings/labs', component: LabsRoutePage },
];
