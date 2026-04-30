import type { FeatureRoute } from '../../core/features/types';
import { MjolnirSettingsPage } from './MjolnirSettingsPage';

export const mjolnirSettingsRoutes: FeatureRoute[] = [
    { path: '/settings/moderation/mjolnir', component: MjolnirSettingsPage },
];
