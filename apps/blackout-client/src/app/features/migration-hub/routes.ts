import type { FeatureRoute } from '../../core/features/types';
import MigrationHubPage from './MigrationHubPage';

export const migrationHubRoutes: FeatureRoute[] = [
    { path: '/migration-hub', component: MigrationHubPage },
];
