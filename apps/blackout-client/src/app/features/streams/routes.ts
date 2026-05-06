import type { FeatureRoute } from '../../core/features/types';
import { LIVE_PATH, LIVE_STREAM_PATH } from '../../pages/paths';
import LiveDirectory from './LiveDirectory';
import LivestreamViewer from './LivestreamViewer';

export const streamsRoutes: FeatureRoute[] = [
    { path: LIVE_PATH, component: LiveDirectory },
    { path: LIVE_STREAM_PATH, component: LivestreamViewer },
];
