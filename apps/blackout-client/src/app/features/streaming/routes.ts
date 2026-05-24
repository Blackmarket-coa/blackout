import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';
import { STREAMING_PATH } from '../../pages/paths';
import StreamingView from './StreamingView';

const StreamingRoutePage = () => createElement(StreamingView);

export const streamingRoutes: FeatureRoute[] = [
    { path: STREAMING_PATH, component: StreamingRoutePage },
];
