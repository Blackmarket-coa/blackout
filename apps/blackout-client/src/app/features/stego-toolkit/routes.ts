import type { FeatureRoute } from '../../core/features/types';
import { StegoLifecyclePage } from './StegoLifecyclePage';
import { StegoToolkitPage } from './StegoToolkitPage';

export const stegoToolkitRoutes: FeatureRoute[] = [
    { path: '/stego/channels', component: StegoToolkitPage },
];

export const ephemeralStegoLifecycleRoutes: FeatureRoute[] = [
    { path: '/stego/channels/lifecycle', component: StegoLifecyclePage },
];
