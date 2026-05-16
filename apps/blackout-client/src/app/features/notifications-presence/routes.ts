import type { FeatureRoute } from '../../core/features/types';
import { PresenceDigestPage } from './PresenceDigestPage';

export const presenceDigestRoutes: FeatureRoute[] = [
    { path: '/notifications/presence-digest', component: PresenceDigestPage },
];
