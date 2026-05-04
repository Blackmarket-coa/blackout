import type { FeatureRoute } from '../../core/features/types';
import PluginsView from './PluginsView';

export const pluginsRoutes: FeatureRoute[] = [
    { path: '/plugins', component: PluginsView },
];
