import type { FeatureRoute } from '../../core/features/types';
import { DraupnirRoutePage } from './draupnir';

export const moderationRoutes: FeatureRoute[] = [
    { path: '/moderation/draupnir', component: DraupnirRoutePage },
];
