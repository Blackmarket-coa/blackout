import type { FeatureRoute } from '../../core/features/types';
import { EVENTS_PATH, EVENT_DETAIL_PATH } from '../../pages/paths';
import EventDirectory from './EventDirectory';
import EventDetail from './EventDetail';

export const eventsRoutes: FeatureRoute[] = [
    { path: EVENTS_PATH, component: EventDirectory },
    { path: EVENT_DETAIL_PATH, component: EventDetail },
];
