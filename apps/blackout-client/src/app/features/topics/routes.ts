import type { FeatureRoute } from '../../core/features/types';
import { TOPIC_DETAIL_PATH, TOPICS_PATH } from '../../pages/paths';
import TopicView from './TopicView';

export const topicsRoutes: FeatureRoute[] = [
    { path: TOPICS_PATH, component: TopicView },
    { path: TOPIC_DETAIL_PATH, component: TopicView },
];
