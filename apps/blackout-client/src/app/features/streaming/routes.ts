import { createElement } from 'react';
import { Navigate } from 'react-router';
import type { FeatureRoute } from '../../core/features/types';
import { CREATOR_HUB_PATH, STREAMING_PATH } from '../../pages/paths';
import StreamingView from './StreamingView';

const StreamingRoutePage = () => createElement(StreamingView);

// `/creator-hub` is the rebranded alias; the shell itself stays mounted on
// STREAMING_PATH so the persisted tab state and shell mobile-tab id keep working.
const CreatorHubAliasRedirect = () =>
    createElement(Navigate, { to: STREAMING_PATH, replace: true });

export const streamingRoutes: FeatureRoute[] = [
    { path: STREAMING_PATH, component: StreamingRoutePage },
    { path: CREATOR_HUB_PATH, component: CreatorHubAliasRedirect },
];
