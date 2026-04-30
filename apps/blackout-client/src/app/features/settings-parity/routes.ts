import type { FeatureRoute } from '../../core/features/types';
import { LabsPage } from './LabsPage';
import { PreferencesPage } from './PreferencesPage';
import { SidebarPage } from './SidebarPage';

export const preferencesRoutes: FeatureRoute[] = [
    { path: '/settings/preferences', component: PreferencesPage },
];

export const sidebarRoutes: FeatureRoute[] = [
    { path: '/settings/sidebar', component: SidebarPage },
];

export const labsRoutes: FeatureRoute[] = [
    { path: '/settings/labs', component: LabsPage },
];
